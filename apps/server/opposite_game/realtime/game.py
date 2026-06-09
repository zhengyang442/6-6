import threading
import time
import uuid

from flask import current_app, request
from flask_socketio import emit

from ..services.questions import normalize_for_online


DEFAULT_ROUND_TIME_MS = 3000
DEFAULT_MATCH_START_DELAY_MS = 2000
match_queue = []
rooms = {}
state_lock = threading.RLock()


def online_player_count():
    with state_lock:
        return sum(
            len(room["players"])
            for room in rooms.values()
            if room.get("active")
        )


def reset_realtime_state():
    with state_lock:
        match_queue.clear()
        rooms.clear()


def _public_question(question):
    return {
        key: value
        for key, value in question.items()
        if key not in {"correct_action", "correct_action_index"}
    }


def _difficulty_for_round(round_number):
    """PK 难度递进曲线：前5轮简单，之后逐步升难。"""
    if round_number <= 5:
        return 1   # easy
    elif round_number <= 12:
        return 2   # medium
    elif round_number <= 18:
        return 3   # hard
    else:
        return 4   # boss


def register_socket_handlers(socketio):
    def round_time_ms():
        return int(
            current_app.config.get(
                "ONLINE_ROUND_TIME_MS", DEFAULT_ROUND_TIME_MS
            )
        )

    def emit_queue_positions():
        with state_lock:
            snapshot = list(match_queue)
        for position, player in enumerate(snapshot, start=1):
            socketio.emit(
                "queue_status",
                {"status": "waiting", "position": position},
                to=player["sid"],
            )

    def score_payload(room_id, room):
        return {
            "room_id": room_id,
            "scores_by_sid": dict(room["scores"]),
            "combos_by_sid": dict(room["combo"]),
            "players": dict(room["players"]),
        }

    def finish_room_locked(room_id, room):
        if not room.get("active"):
            return None
        room["active"] = False
        room["round_open"] = False
        scores = dict(room["scores"])
        total_times = dict(room.get("total_reaction_time", {}))
        highest = max(scores.values(), default=0)
        winners = [sid for sid, score in scores.items() if score == highest]
        # 平局时用总用时决胜负（用时少者胜）
        if len(winners) > 1:
            fastest_time = min(total_times[sid] for sid in winners)
            winners = [sid for sid in winners if total_times[sid] == fastest_time]
        is_draw = len(winners) != 1
        result_by_sid = {}
        for sid, username in room["players"].items():
            answers = room["answers"].get(sid, {})
            result_by_sid[sid] = {
                "username": username,
                "score": scores.get(sid, 0),
                "max_combo": max(
                    (answer.get("combo", 0) for answer in answers.values()),
                    default=0,
                ),
                "total_time_ms": total_times.get(sid, 0),
                "outcome": (
                    "draw"
                    if is_draw
                    else "win"
                    if sid == winners[0]
                    else "lose"
                ),
            }
        return {
            "room_id": room_id,
            "is_draw": is_draw,
            "winner_sid": None if is_draw else winners[0],
            "result_by_sid": result_by_sid,
        }

    def cleanup_room_later(room_id):
        socketio.sleep(3)
        with state_lock:
            rooms.pop(room_id, None)

    def send_question(room_id):
        game_over_payload = None
        payload = None
        token = None
        with state_lock:
            room = rooms.get(room_id)
            if not room or not room.get("active") or room.get("round_open"):
                return
            if room["round"] >= room["max_rounds"]:
                game_over_payload = finish_room_locked(room_id, room)
            else:
                service = current_app.extensions["question_service"]
                # 难度递进曲线
                difficulty = _difficulty_for_round(room["round"] + 1)
                question = normalize_for_online(
                    service.fallback(
                        difficulty=difficulty,
                        exclude_ids=room["used_question_ids"],
                    )
                )
                room["used_question_ids"].add(question["id"])
                room["current_question"] = question
                room["round"] += 1
                room["round_token"] = uuid.uuid4().hex
                room["round_open"] = True
                room["round_started_monotonic"] = time.monotonic()
                room["round_time_ms"] = round_time_ms()
                token = room["round_token"]
                payload = {
                    "room_id": room_id,
                    "round": room["round"],
                    "round_token": token,
                    "total": room["max_rounds"],
                    "question": _public_question(question),
                    "time_limit_ms": room["round_time_ms"],
                }

        if game_over_payload:
            socketio.emit("game_over", game_over_payload, to=room_id)
            socketio.close_room(room_id)
            socketio.start_background_task(cleanup_room_later, room_id)
            return

        socketio.emit("new_question", payload, to=room_id)
        socketio.start_background_task(
            wait_for_timeout,
            current_app._get_current_object(),
            room_id,
            token,
        )

    def wait_for_timeout(app, room_id, round_token):
        with app.app_context():
            duration = int(
                current_app.config.get(
                    "ONLINE_ROUND_TIME_MS", DEFAULT_ROUND_TIME_MS
                )
            )
        socketio.sleep(duration / 1000)
        should_advance = False
        score_update = None
        with app.app_context():
            with state_lock:
                room = rooms.get(room_id)
                if (
                    not room
                    or not room.get("active")
                    or not room.get("round_open")
                    or room.get("round_token") != round_token
                ):
                    return
                round_number = room["round"]
                for sid in room["players"]:
                    if round_number not in room["answers"][sid]:
                        room["combo"][sid] = 0
                        room["total_reaction_time"][sid] += room["round_time_ms"]
                        room["answers"][sid][round_number] = {
                            "correct": False,
                            "timed_out": True,
                            "reaction_time_ms": room["round_time_ms"],
                            "combo": 0,
                            "round_score": 0,
                        }
                room["round_open"] = False
                score_update = score_payload(room_id, room)
                should_advance = True
            socketio.emit("score_update", score_update, to=room_id)
            if should_advance:
                send_question(room_id)

    def abort_room(room_id, leaving_sid, reason):
        with state_lock:
            room = rooms.pop(room_id, None)
            if not room or not room.get("active"):
                return
            room["active"] = False
            remaining = [
                (sid, username)
                for sid, username in room["players"].items()
                if sid != leaving_sid
            ]
            leaving_name = room["players"].get(leaving_sid, "对手")
            player_sids = list(room["players"])

        for sid, _username in remaining:
            socketio.emit(
                "player_left",
                {
                    "room_id": room_id,
                    "username": leaving_name,
                    "reason": reason,
                },
                to=sid,
            )
        for sid in player_sids:
            socketio.server.leave_room(sid, room_id)

    @socketio.on("connect")
    def on_connect():
        emit("connected", {"sid": request.sid})

    @socketio.on("disconnect")
    def on_disconnect():
        sid = request.sid
        with state_lock:
            match_queue[:] = [
                player for player in match_queue if player["sid"] != sid
            ]
            room_id = next(
                (
                    candidate
                    for candidate, room in rooms.items()
                    if room.get("active") and sid in room["players"]
                ),
                None,
            )
        emit_queue_positions()
        if room_id:
            abort_room(room_id, sid, "disconnect")

    @socketio.on("join_queue")
    def on_join_queue(data):
        sid = request.sid
        raw_name = str((data or {}).get("username") or "").strip()
        username = (raw_name or f"玩家{sid[:4]}")[:8]
        with state_lock:
            if any(player["sid"] == sid for player in match_queue):
                emit("queue_status", {"status": "already_in_queue"})
                return
            if any(
                room.get("active") and sid in room["players"]
                for room in rooms.values()
            ):
                emit("error", {"msg": "当前连接已在对局中"})
                return
            match_queue.append(
                {"sid": sid, "username": username, "joined_at": time.time()}
            )
            if len(match_queue) < 2:
                position = len(match_queue)
                players = None
            else:
                first = match_queue.pop(0)
                second = match_queue.pop(0)
                players = (first, second)
                room_id = f"room_{uuid.uuid4().hex}"
                rooms[room_id] = {
                    "players": {
                        first["sid"]: first["username"],
                        second["sid"]: second["username"],
                    },
                    "scores": {first["sid"]: 0, second["sid"]: 0},
                    "combo": {first["sid"]: 0, second["sid"]: 0},
                    "answers": {first["sid"]: {}, second["sid"]: {}},
                    "total_reaction_time": {first["sid"]: 0, second["sid"]: 0},
                    "used_question_ids": set(),
                    "current_question": None,
                    "round": 0,
                    "max_rounds": int(
                        current_app.config.get("ONLINE_MAX_ROUNDS", 20)
                    ),
                    "round_token": None,
                    "round_open": False,
                    "active": True,
                }
                position = None

        if players is None:
            emit(
                "queue_status",
                {"status": "waiting", "position": position},
            )
            return

        for player, opponent in ((players[0], players[1]), (players[1], players[0])):
            socketio.server.enter_room(player["sid"], room_id)
            socketio.emit(
                "match_found",
                {
                    "room_id": room_id,
                    "player_id": player["sid"],
                    "opponent_id": opponent["sid"],
                    "opponent": opponent["username"],
                },
                to=player["sid"],
            )
        emit_queue_positions()
        socketio.start_background_task(
            delayed_start,
            current_app._get_current_object(),
            room_id,
            send_question,
        )

    @socketio.on("leave_queue")
    @socketio.on("cancel_match")
    def on_leave_queue(_data=None):
        sid = request.sid
        with state_lock:
            match_queue[:] = [
                player for player in match_queue if player["sid"] != sid
            ]
        emit("queue_status", {"status": "cancelled"})
        emit_queue_positions()

    @socketio.on("leave_match")
    def on_leave_match(data=None):
        room_id = (data or {}).get("room_id")
        if room_id:
            abort_room(room_id, request.sid, "left")

    @socketio.on("submit_answer")
    def on_submit_answer(data):
        data = data or {}
        sid = request.sid
        room_id = data.get("room_id")
        should_advance = False
        score_update = None
        result_payload = None

        with state_lock:
            room = rooms.get(room_id)
            if not room or not room.get("active") or sid not in room["players"]:
                emit("error", {"msg": "房间不存在或玩家不在房间"})
                return
            if (
                not room.get("round_open")
                or data.get("round_token") != room.get("round_token")
                or data.get("round") != room.get("round")
            ):
                emit("answer_rejected", {"reason": "stale_round"})
                return

            round_number = room["round"]
            if round_number in room["answers"][sid]:
                return
            elapsed_ms = max(
                0,
                int((time.monotonic() - room["round_started_monotonic"]) * 1000),
            )
            timed_out = bool(data.get("timed_out")) or elapsed_ms > room["round_time_ms"]
            question = room["current_question"]
            answer = data.get("answer")
            options = question.get("options") or []
            valid_answer = isinstance(answer, int) and 0 <= answer < len(options)
            if options:
                correct = (
                    not timed_out
                    and valid_answer
                    and answer == question.get("correct_action_index")
                )
            else:
                correct = (
                    not timed_out
                    and isinstance(data.get("action"), str)
                    and data.get("action") == question.get("correct_action")
                )

            if correct:
                combo_bonus = room["combo"][sid] // 3
                speed_bonus = 1 if elapsed_ms < 2000 else 0
                round_score = 1 + combo_bonus + speed_bonus
                room["scores"][sid] += round_score
                room["combo"][sid] += 1
            else:
                round_score = 0
                room["combo"][sid] = 0
            room["total_reaction_time"][sid] += min(
                elapsed_ms,
                room["round_time_ms"],
            )
            room["answers"][sid][round_number] = {
                "correct": correct,
                "timed_out": timed_out,
                "reaction_time_ms": min(
                    elapsed_ms,
                    room["round_time_ms"],
                ),
                "combo": room["combo"][sid],
                "round_score": round_score,
            }
            result_payload = {
                "room_id": room_id,
                "round": round_number,
                "correct": correct,
                "timed_out": timed_out,
                "score": room["scores"][sid],
                "combo": room["combo"][sid],
            }
            score_update = score_payload(room_id, room)
            if all(
                round_number in answers
                for answers in room["answers"].values()
            ):
                room["round_open"] = False
                should_advance = True

        emit("answer_result", result_payload)
        socketio.emit("score_update", score_update, to=room_id)
        if should_advance:
            send_question(room_id)


def delayed_start(app, room_id, send_question):
    with app.app_context():
        delay_ms = int(
            current_app.config.get(
                "ONLINE_MATCH_START_DELAY_MS",
                DEFAULT_MATCH_START_DELAY_MS,
            )
        )
    from ..extensions import socketio

    socketio.sleep(delay_ms / 1000)
    with app.app_context():
        send_question(room_id)
