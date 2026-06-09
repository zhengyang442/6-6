import json
import random
from pathlib import Path


class QuestionService:
    """统一题库服务 — 读取 P0 稳定题库，供 Online PK 和 API 使用。"""

    def __init__(self, p0_path, fallback_path=None):
        self.p0_path = Path(p0_path)
        self.fallback_path = Path(fallback_path) if fallback_path else None
        self._p0_cache = None
        self._fallback_cache = None

    def all_p0(self):
        """加载全部 P0 题目（来自 generate-question-pool.mjs 生成的文件）。"""
        if self._p0_cache is None:
            data = json.loads(self.p0_path.read_text(encoding="utf-8"))
            self._p0_cache = data.get("questions", [])
        return self._p0_cache

    def all_fallback(self):
        """加载旧 fallback.json（兼容旧路径）。"""
        if self._fallback_cache is None and self.fallback_path:
            data = json.loads(self.fallback_path.read_text(encoding="utf-8"))
            self._fallback_cache = data.get("questions", [])
        return self._fallback_cache or []

    def fallback(self, difficulty=None, exclude_ids=None):
        """
        从 P0 题库中随机抽取一题。

        :param difficulty: 目标难度等级（1-5），None 表示不限难度；
                           匹配规则：abs(question_difficulty - requested) <= 1
        :param exclude_ids: 本轮已用题目 ID 集合，用于去重
        :return: 单个题目 dict（浅拷贝）
        """
        exclude_ids = exclude_ids or set()
        questions = self.all_p0()

        # 按难度筛选
        if difficulty is not None:
            pool = [
                q for q in questions
                if q["id"] not in exclude_ids
                and self._matches_difficulty(q, difficulty)
            ]
        else:
            pool = [q for q in questions if q["id"] not in exclude_ids]

        # 降级：忽略 exclude_ids
        if not pool and exclude_ids:
            if difficulty is not None:
                pool = [q for q in questions if self._matches_difficulty(q, difficulty)]
            else:
                pool = list(questions)

        # 最终降级：返回所有题目
        if not pool:
            pool = questions

        question = dict(random.choice(pool))
        question["source"] = "p0_pool"
        return question

    @staticmethod
    def _matches_difficulty(question, difficulty):
        try:
            requested = int(difficulty)
            actual = int(question.get("difficulty", requested))
            return abs(actual - requested) <= 1
        except (TypeError, ValueError):
            return True


def parse_difficulty(value):
    mapping = {
        "easy": 1,
        "medium": 2,
        "hard": 3,
        "extreme": 4,
        "hell": 5,
        "boss": 5,
    }
    if isinstance(value, str):
        normalized = value.lower()
        if normalized in mapping:
            return mapping[normalized]
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1


def normalize_for_online(question):
    normalized = dict(question)
    if "correct_action_index" in normalized:
        return normalized

    correct_action = normalized.get("correct_action")
    options = normalized.get("options") or []
    index = next(
        (
            position
            for position, option in enumerate(options)
            if option.get("action") == correct_action
        ),
        0,
    )
    normalized["correct_action_index"] = index
    return normalized
