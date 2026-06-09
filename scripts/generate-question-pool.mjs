import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const contentDir = path.join(rootDir, "content", "questions");
const outputDir = path.join(rootDir, "apps", "web", "src", "data", "question-pool");

const pools = [
  ["easy", "easyQuestions.js"],
  ["medium", "mediumQuestions.js"],
  ["hard", "hardQuestions.js"],
  ["boss", "bossQuestions.js"],
];

fs.mkdirSync(outputDir, { recursive: true });

// ── P0 筛选逻辑（对齐 question-bank.js isStableP0）─────
const STABLE_TYPES = new Set(["action", "color", "direction", "logic_reversal"]);
const REQUIRED_TAGS = {
  easy: "challenge_warmup",
  medium: "challenge_middle",
  hard: "challenge_hard",
  boss: "challenge_boss",
};

function isStableP0(q) {
  if (!q || q.implementationLevel !== "P0") return false;
  if (!q.id || !q.type || !q.correctAction) return false;
  if (!STABLE_TYPES.has(q.type) || q.experimental) return false;
  if (
    REQUIRED_TAGS[q.difficulty] &&
    (!Array.isArray(q.modeTags) ||
      !q.modeTags.includes(REQUIRED_TAGS[q.difficulty]))
  ) {
    return false;
  }
  // 禁止 swipe 动作配上非 direction 类型
  if (/^swipe_(left|right|up|down)$/.test(q.correctAction)) {
    return q.type === "direction";
  }
  // 禁止 click_left/right/top/bottom 配上非 direction 类型
  if (/^click_(left|right|top|bottom)$/.test(q.correctAction)) {
    return q.type === "direction";
  }
  // action 类型只允许 tap / wait
  if (q.type === "action") {
    return q.correctAction === "tap" || q.correctAction === "wait";
  }
  // 其余类型（color, logic_reversal, visual_trap, chaos, color_stroop）
  // 必须有数组形式的 options，且包含 correctAction
  if (!Array.isArray(q.options)) return false;
  if (q.options.length < 1 || q.options.length > 3) return false;
  return q.options.some(function (option) {
    return (option.id || option.action) === q.correctAction;
  });
}

// ── 规范化选项（对齐 question-bank.js normalizeQuestion）─────
function normalizeOptions(q) {
  if (Array.isArray(q.options) && q.options.length > 0) {
    return q.options.map(function (option) {
      return {
        id: option.id || option.action,
        label: option.label || option.id || option.action,
        action: option.action || option.id,
        color: option.color,
        textColor: option.textColor,
        scale: option.scale,
        blur: option.blur,
        brightness: option.brightness,
        position: option.position,
      };
    });
  }
  // 方向题自动生成选项
  return createDirectionalOptions(q.correctAction);
}
function createDirectionalOptions(correctAction) {
  if (correctAction === "click_left" || correctAction === "click_right") {
    return [
      { id: "left", label: "左", action: "click_left", position: "left" },
      { id: "right", label: "右", action: "click_right", position: "right" },
    ];
  }
  if (correctAction === "click_top" || correctAction === "click_bottom") {
    return [
      { id: "top", label: "上", action: "click_top", position: "top" },
      { id: "bottom", label: "下", action: "click_bottom", position: "bottom" },
    ];
  }
  return null;
}

// ── 生成浏览器 JS 文件 ──
const allP0Questions = [];

for (const [difficulty, outputName] of pools) {
  const source = JSON.parse(
    fs.readFileSync(path.join(contentDir, `${difficulty}.json`), "utf8")
  );
  const body = `/* Generated from content/questions/${difficulty}.json. */\n` +
    `(function (global) {\n` +
    `  "use strict";\n` +
    `  global.QuestionPoolParts = global.QuestionPoolParts || {};\n` +
    `  global.QuestionPoolParts.${difficulty} = ${JSON.stringify(source.questions, null, 2)};\n` +
    `})(window);\n`;
  fs.writeFileSync(path.join(outputDir, outputName), body);

  // 收集 P0 题目供服务端 JSON 使用
  for (const q of source.questions) {
    if (isStableP0(q)) {
      allP0Questions.push({
        id: q.id,
        type: q.type,
        instruction_text: q.prompt,
        prompt_color: q.fontColor || "#FFFFFF",
        correct_action: q.correctAction,
        options: normalizeOptions(q),
        time_limit_ms: q.timeLimit || 1200,
        difficulty: q.difficultyLevel || 1,
        difficulty_name: q.difficulty,
        trap: q.trap || "",
        mode_tags: q.modeTags || [],
      });
    }
  }
}

const motion = JSON.parse(
  fs.readFileSync(path.join(contentDir, "motion.json"), "utf8")
);
const motionBody = `/* Generated from content/questions/motion.json. */\n` +
  `(function (global) {\n` +
  `  "use strict";\n` +
  `  global.MotionQuestionPool = ${JSON.stringify(motion.questions, null, 2)};\n` +
  `})(window);\n`;
fs.writeFileSync(path.join(outputDir, "motionQuestions.js"), motionBody);

// ── 生成服务端统一题库 JSON ──
const serverJson = {
  description: "P0 稳定题库，供服务端 Online PK 和 API 使用。由 generate-question-pool.mjs 自动生成。",
  generated_at: new Date().toISOString(),
  total: allP0Questions.length,
  questions: allP0Questions,
};
const serverJsonPath = path.join(contentDir, "p0-questions.json");
fs.writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2));

console.log(`Generated browser question pools from content/questions.`);
console.log(`Generated server P0 pool: ${allP0Questions.length} questions → ${path.relative(rootDir, serverJsonPath)}`);
