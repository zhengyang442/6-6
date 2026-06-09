// api-client.js —— 《反着来》前端对接示例
// 版本：2026-06-06
// 用法：import { generateQuestion, submitAnswer } from './api-client.js'

const BASE = window.location.origin;  // 自动适配 localhost 或云端域名

// ─── 题目生成 ─────────────────────────────────────
export async function generateQuestion({ difficulty = 1, type = "any", excludeTypes = [] } = {}) {
  const resp = await fetch(`${BASE}/api/generate-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty, type, exclude_types: excludeTypes })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
  // 返回结构：
  // {
  //   type: "color",
  //   instruction_text: "点红色的",
  //   correct_action: "tap_blue",
  //   options: [{ label:"红", action:"tap_red", color:"#FF0000" }, ...],
  //   time_limit_ms: 1000,
  //   source: "ai" | "fallback"
  // }
}

// ─── 提交答案 & 获取反馈 ────────────────────────
// 说明：前端自行对比 action === correct_action，后端只负责最终分析
export function checkAnswer(action, question) {
  const correct = action === question.correct_action;
  return {
    correct,
    correctAction: question.correct_action,
    explanation: correct ? "✅ 正确！" : `❌ 错了。正确答案是「${question.correct_action}」`
  };
}

// ─── 表现分析（游戏结束后调用）─────────────────────
export async function analyzePerformance(answers) {
  // answers: [{ question_type, correct, reaction_time_ms }, ...]
  const resp = await fetch(`${BASE}/api/analyze-performance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
  // 返回结构：
  // {
  //   radar: { reaction_speed, color_discrimination, antisocial_thinking, pressure_resistance },
  //   weakness: "antisocial_thinking",
  //   recommended_difficulty: 3,
  //   comment: "反直觉思维有待提升，多练练！"
  // }
}

// ─── 生成分享文案 ─────────────────────────────────
export async function generateShareText({ score, maxCombo, fastestReactionMs }) {
  const resp = await fetch(`${BASE}/api/generate-share-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      score,
      max_combo: maxCombo,
      fastest_reaction_ms: fastestReactionMs
    })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─── 创建挑战 ─────────────────────────────────────
export async function createChallenge({ playerName, score, questions }) {
  const resp = await fetch(`${BASE}/api/create-challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_name: playerName,
      score,
      questions
    })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
  // 返回：{ challenge_code: "A1B2C3", share_url: "https://douyin.com/share/A1B2C3" }
}

// ─── 获取挑战 ─────────────────────────────────────
export async function getChallenge(code) {
  const resp = await fetch(`${BASE}/api/challenge/${code}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─── 健康检查 ─────────────────────────────────────
export async function healthCheck() {
  const resp = await fetch(`${BASE}/health`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
