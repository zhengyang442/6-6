# 反着来 — API 客户端代码

> 给前端A：把这个文件里的代码复制进你的项目，命名为 `api-client.js`，直接 `import` 就能用。
>
> 后端地址：`http://localhost:5000`

---

## 使用方法

```javascript
import { generateQuestion, analyzePerformance } from "./api-client.js";

// 拿一道题
const q = await generateQuestion("easy");
// q.instruction_text → "不要点红色的"
// q.options → [{label:"红", action:"tap_red", color:"#EE4444"}, {label:"蓝", action:"tap_blue", color:"#4444DD"}]

// 用户点了"蓝" → q.correct_action === "tap_blue" → 正确！
```

---

## 完整代码

```javascript
/**
 * 反着来 — API 客户端
 * 
 * 使用方法：
 *   1. 确保后端运行在 localhost:5000
 *   2. 把这个文件放到你的项目里
 *   3. import { generateQuestion, analyzePerformance, ... } from "./api-client.js"
 *   4. 直接调用，所有函数返回 Promise
 * 
 * @for 前端A — 对接反着来游戏后端
 */

const BASE_URL = "http://localhost:5000";

// ─── 内部工具 ─────────────────────────────────────────

async function apiPost(path, body) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`API ${path} 返回 ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

// ─── 核心 API ─────────────────────────────────────────

/**
 * 生成一道题目（AI 动态出题 → 本地题库降级）
 * 
 * @param {"easy"|"medium"|"hard"} difficulty - 难度
 * @param {"color"|"direction"|"math"|"double_neg"|"combo"|"any"} type - 题型，默认 any
 * @returns {Promise<{
 *   type: string,
 *   instruction_text: string,
 *   correct_action: string,
 *   options: Array<{label: string, action: string, color?: string, direction?: string}>,
 *   time_limit_ms: number,
 *   source: "ai" | "fallback",
 *   tip: string
 * }>}
 * 
 * @example
 *   const q = await generateQuestion("easy");
 *   // q.instruction_text → "不要点红色的"
 *   // q.options → [{label:"红", action:"tap_red", color:"#EE4444"}, {label:"蓝", action:"tap_blue", color:"#4444DD"}]
 *   // q.correct_action → "tap_blue"
 *   // 用户点蓝 → 正确！
 */
export async function generateQuestion(difficulty = "easy", type = "any") {
  return apiPost("/api/generate-question", { difficulty, type });
}

/**
 * 分析一局的玩家表现
 * 
 * @param {Array<{
 *   correct: boolean,
 *   reaction_time_ms: number,
 *   question_type: string
 * }>} answers - 每道题的作答记录
 * @returns {Promise<{
 *   correct_rate: number,
 *   avg_reaction_ms: number,
 *   fastest_ms: number,
 *   radar: { color: number, direction: number, math: number, double_neg: number },
 *   weakness: string,
 *   comment: string
 * }>}
 * 
 * @example
 *   const analysis = await analyzePerformance([
 *     { correct: true,  reaction_time_ms: 500, question_type: "color" },
 *     { correct: false, reaction_time_ms: 800, question_type: "direction" },
 *   ]);
 *   // analysis.weakness → "方向辨别"
 *   // analysis.radar → { color: 100, direction: 0, math: 80, double_neg: 60 }
 */
export async function analyzePerformance(answers) {
  return apiPost("/api/analyze-performance", { answers });
}

/**
 * 生成分享文案
 * 
 * @param {{
 *   score: number,
 *   max_combo: number,
 *   total_questions: number,
 *   correct_count: number,
 *   reaction_times_ms: number[]
 * }} stats - 游戏数据
 * @returns {Promise<{
 *   share_title: string,
 *   share_text: string,
 *   hashtags: string[],
 *   share_image_prompt: string
 * }>}
 */
export async function generateShareText(stats) {
  return apiPost("/api/generate-share-text", stats);
}

/**
 * 创建挑战（生成 6 位码 + 挑战链接）
 * 
 * @param {number} score - 你的分数
 * @param {string} nickname - 你的昵称
 * @returns {Promise<{
 *   challenge_id: string,
 *   challenge_code: string,
 *   share_url: string
 * }>}
 */
export async function createChallenge(score, nickname) {
  return apiPost("/api/create-challenge", { score, nickname });
}

// ─── 健康检查（可用于判断后端是否在线）────────────────

/**
 * 检查后端是否在线
 * @returns {Promise<{status: string, version: string}>}
 */
export async function healthCheck() {
  const resp = await fetch(`${BASE_URL}/health`);
  return resp.json();
}
```

---

## 接口速查表

| 函数 | 请求体 | 返回关键字段 |
|------|--------|-------------|
| `generateQuestion("easy")` | `{difficulty, type}` | `instruction_text`, `correct_action`, `options[]`, `time_limit_ms`, `source` |
| `analyzePerformance(answers)` | `{answers: [{correct, reaction_time_ms, question_type}]}` | `correct_rate`, `radar{}`, `weakness`, `comment` |
| `generateShareText(stats)` | `{score, max_combo, total_questions, correct_count, reaction_times_ms}` | `share_title`, `share_text`, `hashtags[]` |
| `createChallenge(85, "昵称")` | `{score, nickname}` | `challenge_code`, `share_url` |
| `healthCheck()` | 无 | `{status: "ok", version: "1.0.0"}` |
