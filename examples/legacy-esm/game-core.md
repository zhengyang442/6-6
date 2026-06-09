# 反着来 — 游戏核心逻辑模块

> 给前端A：纯逻辑模块，无渲染依赖。复制代码 → 命名 `game-core.js` → `import { createGame } from "./game-core.js"` → 接 Canvas 渲染即可。
>
> 设计：事件驱动状态机。前端只需订阅事件 + 调用函数，不用想游戏规则。

---

## 使用方法（5 分钟接入）

```javascript
import { createGame } from "./game-core.js";

const game = createGame();

// 1. 订阅事件
game.on("question", ({ question }) => {
  // 渲染题目到 Canvas
  drawInstruction(question.instruction_text);
  drawOptions(question.options);
});

game.on("correct", ({ points, combo }) => {
  // 播放正确动画
  showCorrectEffect(points, combo);
});

game.on("wrong", ({ livesLeft }) => {
  // 播放错误动画 + 扣血
  showWrongEffect(livesLeft);
});

game.on("gameOver", ({ score, maxCombo, analysis }) => {
  // 展示结算画面
  showResultScreen(score, maxCombo, analysis);
});

// 2. 开始游戏
await game.start(20); // 20 题一局

// 3. 用户触控 → 提交动作
canvas.addEventListener("click", (e) => {
  const action = hitTest(e); // 你实现的触摸命中检测
  game.submitAction(action); // "tap_red" / "swipe_left" / "tap_blue" ...
});

// 4. 反馈结束 → 加载下一题
game.on("feedback", () => {
  setTimeout(() => game.nextQuestion(), 800); // 800ms 后下一题
});

// 5. 每帧更新计时器
function loop(now) {
  game.tick(16); // ~60fps
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

---

## 公开 API 速查

| 方法 | 说明 | 参数 |
|------|------|------|
| `game.start(n)` | 开始一局 | `n` = 总题数，默认 20 |
| `game.submitAction(action)` | 玩家做出动作 | `action` = `"tap_red"` / `"swipe_left"` 等 |
| `game.tick(deltaMs)` | 计时器滴答 | 距上帧毫秒数 |
| `game.nextQuestion()` | 反馈结束加载下一题 | 无 |
| `game.getPublicState()` | 读当前状态快照 | 返回 `{ phase, score, combo, lives, question, ... }` |
| `game.on(event, fn)` | 订阅事件 | event 见下表 |
| `game.off(event, fn)` | 取消订阅 | 同上 |

---

## 事件速查

| 事件 | 触发时机 | data |
|------|---------|------|
| `"gameStart"` | 开始新局 | `{ phase, score, lives, totalQuestions }` |
| `"question"` | 新题加载 | `{ question, index }` |
| `"correct"` | 答对 | `{ points, combo, reactionMs }` |
| `"wrong"` | 答错 | `{ livesLeft, reactionMs }` |
| `"feedback"` | 反馈阶段（对/错） | `{ correct, action, reactionMs, correctAction }` |
| `"gameOver"` | 游戏结束 | `{ score, maxCombo, analysis }` |
| `"stateChange"` | 任何状态变化 | 完整 publicState |
| `"error"` | 后端调用失败 | `{ message }` |

---

## 计分规则（你不需要实现，game-core 已内置）

- 基础分：10 分
- 连击加成：combo × 10，上限 10 连（最高 100 分/题）
- 速度加成：反应 <500ms 额外 +5 分
- 生命值：3 条命，答错 -1，0 命或 20 题结束 = 游戏结束
- 难度阶梯：easy×4 → easy×1 medium×3 → medium×4 hard×4...

---

## 完整代码

```javascript
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
const TIME_BONUS_THRESHOLD_MS = 500;
const TIME_BONUS_SCORE = 5;

// ─── 游戏核心 ────────────────────────────────────────

export function createGame() {
  const bus = new EventEmitter();

  const state = {
    phase: PHASE.INTRO,
    score: 0,
    combo: 0,
    maxCombo: 0,
    lives: MAX_LIVES,
    question: null,
    questionIndex: 0,
    totalQuestions: 20,
    timeLimitMs: 0,
    timeLeftMs: 0,
    lastAnswer: null,
    answers: [],
    difficultyIndex: 0,
  };

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

  async function submitAction(action) {
    if (state.phase !== PHASE.PLAYING) return;
    if (!state.question) return;

    const correct = action === state.question.correct_action;
    const reactionMs = state.timeLimitMs - state.timeLeftMs;

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
    state.phase = PHASE.FEEDBACK;
    bus.emit("feedback", { correct, ...state.lastAnswer });
  }

  function tick(deltaMs) {
    if (state.phase !== PHASE.PLAYING) return;
    state.timeLeftMs = Math.max(0, state.timeLeftMs - deltaMs);
    if (state.timeLeftMs <= 0) {
      submitAction("timeout");
    }
  }

  async function nextQuestion() {
    if (state.phase !== PHASE.FEEDBACK) return;
    await _nextQuestion();
  }

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

  function on(event, fn) { bus.on(event, fn); }
  function off(event, fn) { bus.off(event, fn); }

  async function _nextQuestion() {
    const diffIdx = Math.min(state.difficultyIndex, DIFFICULTY_ORDER.length - 1);
    const difficulty = DIFFICULTY_ORDER[diffIdx];

    let q;
    try {
      q = await generateQuestion(difficulty);
    } catch {
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

    let pts = BASE_SCORE * Math.min(state.combo, 10);
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

  return { start, submitAction, tick, nextQuestion, getPublicState, on, off };
}
```
