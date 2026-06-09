/**
 * 反着来 — 游戏核心逻辑模块
 * 
 * 纯逻辑，无渲染依赖。前端接上 Canvas/触控即可运行。
 * 
 * 架构：事件驱动状态机
 *   INTRO → PLAYING → FEEDBACK → PLAYING | GAMEOVER
 * 
 * 使用：前端队友 copy 这个文件 + api-client.js → 订阅事件 → 渲染
 */

import { generateQuestion, analyzePerformance } from "./api-client.js";

// ─── 微型事件发射器 ─────────────────────────────────

class EventEmitter {
  constructor() {
    this._listeners = {};
  }
  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
  }
  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(f => f !== fn);
  }
  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}

// ─── 常量 ────────────────────────────────────────────

const PHASE = { INTRO: "intro", PLAYING: "playing", FEEDBACK: "feedback", GAMEOVER: "gameover" };

const DIFFICULTY_ORDER = ["easy", "easy", "easy", "easy", "medium", "medium", "medium", "hard"];

const BASE_SCORE = 10;
const MAX_LIVES = 3;
const TIME_BONUS_THRESHOLD_MS = 500; // 反应 <500ms 额外加分
const TIME_BONUS_SCORE = 5;

// ─── 游戏核心 ────────────────────────────────────────

export function createGame() {
  const bus = new EventEmitter();

  // ── 状态 ──────────────────────────────────────────

  const state = {
    phase: PHASE.INTRO,
    score: 0,
    combo: 0,
    maxCombo: 0,
    lives: MAX_LIVES,
    question: null,         // 当前题目对象（来自 API）
    questionIndex: 0,       // 已答几题
    totalQuestions: 20,     // 一局总题数（可改）
    timeLimitMs: 0,         // 当前题倒计时
    timeLeftMs: 0,          // 剩余时间
    lastAnswer: null,       // { correct, action, reactionMs }
    answers: [],            // 全局面板记录
    difficultyIndex: 0,     // 当前难度游标
  };

  // ── 公开 API ──────────────────────────────────────

  /** 开始一局 */
  async function start(totalQuestions = 20) {
    Object.assign(state, {
      phase: PHASE.PLAYING,
      score: 0,
      combo: 0,
      maxCombo: 0,
      lives: MAX_LIVES,
      questionIndex: 0,
      totalQuestions,
      answers: [],
      difficultyIndex: 0,
      lastAnswer: null,
    });
    bus.emit("gameStart", getPublicState());
    await _nextQuestion();
  }

  /** 玩家做出动作 */
  async function submitAction(action) {
    if (state.phase !== PHASE.PLAYING) return;
    if (!state.question) return;

    const correct = action === state.question.correct_action;
    const reactionMs = state.timeLimitMs - state.timeLeftMs;

    // 记录
    state.lastAnswer = { correct, action, reactionMs, correctAction: state.question.correct_action };
    state.answers.push({
      correct,
      reaction_time_ms: reactionMs,
      question_type: state.question.type,
    });

    if (correct) {
      _handleCorrect(reactionMs);
    } else {
      _handleWrong(reactionMs);
    }

    bus.emit("stateChange", getPublicState());

    // 反馈阶段 → 短暂停留后下一题
    state.phase = PHASE.FEEDBACK;
    bus.emit("feedback", { correct, ...state.lastAnswer });
  }

  /** 计时器滴答（前端 requestAnimationFrame 或 setInterval 每帧调用） */
  function tick(deltaMs) {
    if (state.phase !== PHASE.PLAYING) return;
    state.timeLeftMs = Math.max(0, state.timeLeftMs - deltaMs);
    if (state.timeLeftMs <= 0) {
      // 超时 = 错误
      submitAction("timeout");
    }
  }

  /** 反馈结束后加载下一题 */
  async function nextQuestion() {
    if (state.phase !== PHASE.FEEDBACK) return;
    await _nextQuestion();
  }

  /** 获取公开状态（给渲染层读） */
  function getPublicState() {
    return {
      phase: state.phase,
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      lives: state.lives,
      question: state.question,
      questionIndex: state.questionIndex,
      totalQuestions: state.totalQuestions,
      timeLimitMs: state.timeLimitMs,
      timeLeftMs: state.timeLeftMs,
      lastAnswer: state.lastAnswer,
    };
  }

  /** 监听事件 */
  function on(event, fn) { bus.on(event, fn); }
  function off(event, fn) { bus.off(event, fn); }

  // ── 内部逻辑 ──────────────────────────────────────

  async function _nextQuestion() {
    // 难度阶梯升
    const diffIdx = Math.min(state.difficultyIndex, DIFFICULTY_ORDER.length - 1);
    const difficulty = DIFFICULTY_ORDER[diffIdx];

    let q;
    try {
      q = await generateQuestion(difficulty);
    } catch {
      // 如果后端挂了，抛事件让渲染层显示错误
      bus.emit("error", { message: "无法获取题目，请检查后端是否运行" });
      return;
    }

    state.question = q;
    state.timeLimitMs = q.time_limit_ms;
    state.timeLeftMs = q.time_limit_ms;
    state.phase = PHASE.PLAYING;

    bus.emit("question", { question: q, index: state.questionIndex });
    bus.emit("stateChange", getPublicState());
  }

  function _handleCorrect(reactionMs) {
    state.combo += 1;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    let pts = BASE_SCORE * Math.min(state.combo, 10); // combo 乘数上限 10x
    if (reactionMs < TIME_BONUS_THRESHOLD_MS) pts += TIME_BONUS_SCORE;

    state.score += pts;
    state.questionIndex += 1;
    state.difficultyIndex += 1;

    bus.emit("correct", { points: pts, combo: state.combo, reactionMs });

    _checkEnd();
  }

  function _handleWrong(reactionMs) {
    state.combo = 0;
    state.lives -= 1;
    state.questionIndex += 1;

    bus.emit("wrong", { livesLeft: state.lives, reactionMs });

    _checkEnd();
  }

  function _checkEnd() {
    if (state.lives <= 0 || state.questionIndex >= state.totalQuestions) {
      _gameOver();
    }
  }

  async function _gameOver() {
    state.phase = PHASE.GAMEOVER;

    // 调后端分析
    let analysis = null;
    try {
      analysis = await analyzePerformance(state.answers);
    } catch {
      analysis = { correct_rate: 0, weakness: "未知", comment: "分析服务暂不可用" };
    }

    bus.emit("gameOver", {
      score: state.score,
      maxCombo: state.maxCombo,
      totalQuestions: state.questionIndex,
      livesLeft: state.lives,
      analysis,
    });
    bus.emit("stateChange", getPublicState());
  }

  // ── 返回 ──────────────────────────────────────────

  return {
    start,
    submitAction,
    tick,
    nextQuestion,
    getPublicState,
    on,
    off,
  };
}
