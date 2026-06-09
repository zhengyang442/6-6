# 《反着来》游戏架构文档

> 版本：v1.0 | 日期：2026-06-06
>
> 本文档定义《反着来》(The Opposite Game) 的完整技术架构，按 V1 → V2 → V3 三阶段逐步演进。

---

## 目录

1. [架构总览（C4 模型）](#1-架构总览c4-模型)
2. [架构决策记录（ADR）](#2-架构决策记录adr)
3. [V1 架构：纯前端可玩版](#3-v1-架构纯前端可玩版)
4. [V2 架构：引入后端](#4-v2-架构引入后端)
5. [V3 架构：社交功能](#5-v3-架构社交功能)
6. [组件详细设计](#6-组件详细设计)
7. [文件结构与部署](#7-文件结构与部署)
8. [接口契约（API Contract）](#8-接口契约api-contract)
9. [风险与降级策略](#9-风险与降级策略)

---

## 1. 架构总览（C4 模型）

### 1.1 系统上下文图（Context）

```
┌──────────────────────────────────────────────────────────┐
│                         玩家                              │
│                     (抖音小游戏用户)                        │
└──────────────┬───────────────────────────────────────────┘
               │ 触控操作 / 分享
               ▼
┌──────────────────────────────┐     ┌──────────────────────┐
│       《反着来》游戏系统        │────▶│   通义千问 / DeepSeek  │
│                              │     │   (AI 指令生成)       │
│   Canvas 渲染 + 触控交互      │     └──────────────────────┘
│   游戏引擎 + 成绩管理          │
│   分享卡片 + 挑战模式          │     ┌──────────────────────┐
│                              │────▶│   抖音小游戏平台        │
└──────────────────────────────┘     │   (宿主容器)          │
                                     └──────────────────────┘
```

### 1.2 容器图（Container）

```
┌─ 前端容器 ────────────────────────────────────────────────────┐
│                                                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ index.html │  │ game.css   │  │ game.js    │              │
│  │ 单页入口    │  │ 样式定义    │  │ 游戏核心    │              │
│  │ + Canvas   │  │            │  │             │              │
│  └─────┬──────┘  └────────────┘  └──────┬──────┘              │
│        │                                │                      │
│        │       localStorage              │    fetch()           │
│        │    (成绩/称号/设置)              │    (AI API/挑战)      │
│        ▼                                ▼                      │
│  ┌────────────┐                 ┌──────────────┐              │
│  │ 本地存储    │                 │  后端 API     │              │
│  │            │                 │  (Flask)      │              │
│  └────────────┘                 │  端口 5000    │              │
│                                  └──────┬───────┘              │
│                                         │                       │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                   ┌──────────┐   ┌──────────┐   ┌────────────┐
                   │ 本地题库  │   │ 通义千问  │   │ 挑战存储    │
                   │ JSON文件  │   │ API      │   │ (JSON文件) │
                   └──────────┘   └──────────┘   └────────────┘
```

---

## 2. 架构决策记录（ADR）

### ADR-001: 单页 HTML + Canvas 作为核心渲染方案

- **状态**: 已接受
- **上下文**: 目标平台是抖音小游戏（H5容器），26 小时内交付，全员非 CS 背景
- **决策**: 使用单个 HTML 文件嵌入所有 CSS 和 JS，Canvas 2D 渲染游戏画面
- **放弃**: React/Vue 等框架（增加构建链路，26h 内不值得）；DOM 渲染（动画性能不如 Canvas）
- **后果**: 初期开发极快，后期代码可能超过 1000 行需要拆模块；Canvas 文字渲染不如 DOM 清晰

### ADR-002: 题库双模式：本地 JSON 降级 + AI 增强

- **状态**: 已接受
- **上下文**: AI API（通义千问/DeepSeek）在黑客松现场可能不稳定，延迟不可控
- **决策**: 预生成 200+ 条题目的 `questions-fallback.json` 作为降级方案；AI 生成题目作为增强模式，在 API 可用时替换本地题目
- **放弃**: 纯 AI 生成（依赖单点，比赛现场不可接受）；纯本地题库（缺乏"AI 原生"标签，评委可能会问）
- **后果**: 题库多样性受限但可靠性极高；切换逻辑需要在前端实现，增加约 50 行代码

### ADR-003: V1 纯前端，V2 引入最小化后端

- **状态**: 已接受
- **上下文**: 设计文档明确"不做登录注册""不做复杂数据库""优先纯前端+直调 API"
- **决策**: V1（P0阶段，0-10h）纯前端，API 直接调用通义千问；V2（P1阶段，10-22h）用 Flask 封装后端，提供题目缓存、难度分析、分享文案三个 endpoint
- **放弃**: V1 就搭后端（拖慢开局，V1 只需要能跑）
- **后果**: V1 前端直调 AI API 需要暴露 API Key（可通过环境变量或服务端代理解决）；V2 迁移时前端改 API 调用路径即可，代价很低

### ADR-004: 游戏状态用全局对象，不用状态管理库

- **状态**: 已接受
- **上下文**: 单文件、单页面、4 人团队
- **决策**: 用一个全局 `gameState` 对象管理所有状态（分数、连击、当前题号、历史记录等）。前端队友只需要读/写这个对象
- **放弃**: Redux/MobX/Pinia 等状态管理（杀鸡用牛刀，学习成本高）
- **后果**: 状态修改追踪困难（但单文件 debug 也简单），多人同时改可能冲突（靠 Git 和沟通解决）

### ADR-005: Canvas 尺寸固定 375×667

- **状态**: 已接受
- **上下文**: 抖音小游戏 H5 容器的标准渲染区域
- **决策**: Canvas 固定 375×667，不做响应式。设备适配交给抖音小游戏容器处理
- **放弃**: 响应式布局（增加前端复杂度，且 26h 内适配所有屏幕不现实）
- **后果**: 在非标设备上可能有黑边，但抖音容器会自动居中缩放

---

## 3. V1 架构：纯前端可玩版

### 3.1 目标

第 0-10 小时交付。**核心交互能跑**：指令弹出 → 玩家操作 → 判断对错 → 分数 + 连击 → 下一题。

### 3.2 技术栈

| 层 | 技术 | 原因 |
|----|------|------|
| 渲染 | Canvas 2D API | 动画流畅，不依赖 DOM |
| 交互 | Touch Events | 滑动/点击/长按，原生事件 |
| 题库 | 本地 JSON 文件 | 不依赖网络 |
| 状态 | 全局 `gameState` 对象 | 简单直接 |
| 持久化 | localStorage | 成绩、称号本地存储 |
| 音频 | Web Audio API | 短音效不需要加载大文件 |

### 3.3 组件图

```
┌─────────────────────────────────────────────────────────┐
│                     index.html                           │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ GameLoop │  │ Renderer │  │    InputHandler       │  │
│  │ (主循环)  │─▶│ (Canvas) │  │  ┌──────┐ ┌────────┐ │  │
│  │          │  │          │  │  │ Tap  │ │ Swipe  │ │  │
│  │ 驱动所有  │  │ 画题目    │  │  │ 点击 │ │ 滑动   │ │  │
│  │ 组件协调  │  │ 画按钮    │  │  └──────┘ └────────┘ │  │
│  └────┬─────┘  │ 画特效    │  └──────────┬───────────┘  │
│       │        └──────────┘             │               │
│       ▼                                 ▼               │
│  ┌──────────┐                    ┌──────────┐          │
│  │Question  │                    │  Judge   │          │
│  │Provider  │                    │ (判定器)  │          │
│  │          │                    │          │          │
│  │ 取下一题  │                    │ 对/错判断 │          │
│  └────┬─────┘                    └────┬─────┘          │
│       │                               │                │
│       │  读取                         │  更新           │
│       ▼                               ▼                │
│  ┌──────────────────────────────────────────┐         │
│  │           gameState (全局状态)             │         │
│  │  score, combo, maxCombo, questionIndex,   │         │
│  │  answers[], difficulty, currentQuestion   │         │
│  └──────────────┬───────────────────────────┘         │
│                 │                                      │
│      ┌──────────┼──────────┐                          │
│      ▼          ▼          ▼                          │
│  ┌───────┐ ┌───────┐ ┌──────────┐                    │
│  │Score  │ │Effect │ │ Timer    │                    │
│  │Manager│ │Manager│ │ Manager  │                    │
│  │       │ │       │ │          │                    │
│  │ 分数   │ │ 特效   │ │ 0.8s倒  │                    │
│  │ 连击   │ │ 音效   │ │ 计时     │                    │
│  └───────┘ └───────┘ └──────────┘                    │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │            localStorage                      │     │
│  │  bestScore, achievements, settings           │     │
│  └─────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 3.4 游戏主循环（GameLoop）

```
                    ┌─────────┐
                    │  开始    │
                    └────┬────┘
                         ▼
              ┌─────────────────────┐
         ┌───│  QuestionProvider    │
         │   │  获取下一题           │
         │   └──────────┬──────────┘
         │              ▼
         │   ┌─────────────────────┐
         │   │  Renderer            │
         │   │  绘制题目 + 按钮      │
         │   └──────────┬──────────┘
         │              ▼
         │   ┌─────────────────────┐
         │   │  Timer.start(800ms) │
         │   └──────────┬──────────┘
         │              │
         │    ┌─────────┴─────────┐
         │    ▼                   ▼
         │ ┌──────────┐   ┌──────────────┐
         │ │ 玩家操作  │   │  倒计时到     │
         │ │ InputHandler│ │  → 判定为错  │
         │ └────┬─────┘   └──────┬───────┘
         │      │                │
         │      └───────┬────────┘
         │              ▼
         │   ┌─────────────────────┐
         │   │  Judge               │
         │   │  判断对/错            │
         │   └──────────┬──────────┘
         │              ▼
         │   ┌─────────────────────┐
         │   │  ScoreManager        │
         │   │  更新分数/连击         │
         │   └──────────┬──────────┘
         │              ▼
         │   ┌─────────────────────┐
         │   │  EffectManager       │
         │   │  播放反馈动画/音效     │
         │   └──────────┬──────────┘
         │              │
         │              ▼
         │        ┌──────────┐
         │        │ 还有题？   │
         │        └────┬─────┘
         │      是 │     │ 否
         └─────────┘     ▼
                   ┌──────────┐
                   │ 结算画面   │
                   │ 成绩单 +   │
                   │ 雷达图     │
                   └──────────┘
```

### 3.5 V1 交付清单

| 文件 | 说明 | 优先级 |
|------|------|--------|
| `index.html` | 单页入口，含 Canvas + 内联 CSS + 内联 JS | P0 |
| `questions-fallback.json` | 200+ 条本地题目 | P0 |
| 无 | V1 不需要后端 | -- |

---

## 4. V2 架构：引入后端

### 4.1 目标

第 10-22 小时交付。AI 动态生成题目、个性化分享文案、成绩持久化（挑战模式数据）。

### 4.2 技术栈增量

| 层 | 新增 | 原因 |
|----|------|------|
| 后端框架 | Flask (Python) | 轻量、快速搭建、你们熟悉 |
| AI 模型 | 通义千问 API / DeepSeek API | 国内可用，低延迟 |
| 挑战数据 | JSON 文件存储 | 不需要数据库，4 人团队够用 |
| 前端 API 层 | 新增 `api-client.js` | 封装 HTTP 调用 |

### 4.3 前后端交互图

```
┌─ 前端 (index.html) ────────────────────────┐
│                                              │
│  api-client.js                               │
│  ├─ generateQuestion(difficulty)             │
│  ├─ analyzePerformance(answers)              │
│  ├─ generateShareText(stats)                 │
│  ├─ createChallenge(player, score, questions)│
│  └─ getChallenge(code)                       │
│                                              │
└──────────────────┬───────────────────────────┘
                   │ HTTP (fetch)
                   ▼
┌─ 后端 (server.py, Flask, 端口 5000) ────────┐
│                                              │
│  /api/generate-question     → AI 生成题目     │
│  /api/analyze-performance   → 难度分析        │
│  /api/generate-share-text   → 个性化文案      │
│  /api/create-challenge      → 创建挑战        │
│  /api/challenge/{code}      → 获取挑战        │
│                                              │
│  ┌──────────────────────┐                    │
│  │  AI Client (降级感知)  │                    │
│  │  1. 先调通义千问       │                    │
│  │  2. 超时 3s → DeepSeek│                    │
│  │  3. 都挂 → 返回本地题库 │                    │
│  └──────────────────────┘                    │
│                                              │
│  ┌──────────────────────┐                    │
│  │  Challenge Store      │                    │
│  │  data/challenges/     │                    │
│  │  {code}.json          │                    │
│  └──────────────────────┘                    │
│                                              │
└──────────────────────────────────────────────┘
```

### 4.4 V2 交付清单

| 文件 | 说明 | 优先级 |
|------|------|--------|
| `server.py` | Flask 主服务 | P1 |
| `ai-client.py` | AI API 调用封装（含降级逻辑） | P1 |
| `api-client.js` | 前端 API 调用封装 | P1 |
| `data/questions-fallback.json` | 本地题库（已有，可能扩量） | P1 |
| `data/challenges/*.json` | 挑战数据存储 | P1 |

---

## 5. V3 架构：社交功能

### 5.1 目标

比赛后持续完善。排行榜、观战模式、皮肤商店数据同步。

### 5.2 变更

- 挑战模式从 JSON 文件迁移到 SQLite（数据量增长后 JSON 文件查找变慢）
- 接入抖音开放平台的数据存储 API（如果比赛后需要上架）
- 排行榜用 Redis Sorted Set（如果用户量增长）

> V3 细节不在本次 26h 范围内，仅预留扩展点。

---

## 6. 组件详细设计

### 6.1 QuestionProvider（题目提供者）

**职责**: 提供下一道题目，屏蔽题目来源（本地 / AI）。

```javascript
// 接口设计（前端用）
const QuestionProvider = {
  /**
   * 获取下一道题目
   * @returns {Question} {type, instructionText, correctAction, options, timeLimitMs}
   */
  async getNext(difficulty, excludeTypes, previousQuestions) {
    // V1: 从 questions-fallback.json 随机取
    // V2: 先调后端 AI API，失败则本地降级
  }
};
```

**题目数据结构**:
```json
{
  "type": "color",
  "instructionText": "点蓝色的",
  "correctAction": "tap_blue",
  "options": [
    {"label": "红", "action": "tap_red", "color": "#FF4444"},
    {"label": "蓝", "action": "tap_blue", "color": "#4444FF"}
  ],
  "timeLimitMs": 800
}
```

**五种题型的正确答案逻辑**:

| type | correctAction | 说明 |
|------|---------------|------|
| `direction` | `swipe_left` 或 `swipe_right` | 指令说"向左滑"→ 正确是"向右滑" |
| `color` | `tap_{color}` | 指令说"点红色的"→ 正确是"点蓝色的" |
| `action` | `tap_any` | 指令说"别动"→ 正确是"立刻点" |
| `double_neg` | `tap_any` | 指令说"不要不点"→ 正确是"点一下" |
| `combo` | `tap_{color}` | 指令说"不要点红色的"→ 正确是"点蓝色的" |

### 6.2 InputHandler（输入处理器）

**职责**: 捕捉触控事件，归一化为标准动作类型。

```javascript
// 接口设计
const InputHandler = {
  /**
   * 绑定事件到 Canvas
   * @param {Function} onAction - 回调：(actionType, detail) => void
   */
  bind(canvas, onAction) {
    // touchstart → 记录起始位置
    // touchend → 计算位移 → 判断 tap / swipe_left / swipe_right / hold
  }
};
```

**支持的动作类型**:
| 动作 | 触发条件 | 对应题目 |
|------|----------|----------|
| `tap_red` | 点击红色按钮区域 | 颜色类 |
| `tap_blue` | 点击蓝色按钮区域 | 颜色类 |
| `tap_any` | 点击任意按钮区域 | 动作类、双重否定 |
| `swipe_left` | 左滑 > 50px | 方向类 |
| `swipe_right` | 右滑 > 50px | 方向类 |
| `timeout` | 800ms 无操作 | 所有题型 |

### 6.3 Judge（判定器）

**职责**: 对比玩家操作和正确答案，返回判定结果。

```javascript
// 接口设计
const Judge = {
  /**
   * @param {string} playerAction - 玩家操作
   * @param {string} correctAction - 正确答案
   * @param {number} reactionTimeMs - 反应时间
   * @returns {Verdict} {correct, reactionTimeMs, message}
   */
  evaluate(playerAction, correctAction, reactionTimeMs) {
    // 简单规则：playerAction === correctAction
    // 特殊情况：
    //   - 方向类：玩家做了任何非滑动操作 → 错
    //   - 颜色类：玩家点了错误颜色 → 错（含"差0.01秒"信息）
  }
};
```

### 6.4 ScoreManager（分数管理）

**职责**: 管理分数、连击、历史最佳。

```javascript
const ScoreManager = {
  state: {
    score: 0,
    combo: 0,
    maxCombo: 0,
    answers: [],      // [{type, correct, reactionTimeMs}]
    questionIndex: 0,
    totalQuestions: 30,
  },

  onCorrect(reactionTimeMs) {
    this.state.combo++;
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
    this.state.score += 1;
    this.state.answers.push({correct: true, reactionTimeMs});
  },

  onWrong(reactionTimeMs) {
    this.state.combo = 0;
    this.state.answers.push({correct: false, reactionTimeMs});
  },

  getResults() {
    // 返回：正确数、最长连击、最快反应、击败百分比（基于本地历史）
  }
};
```

### 6.5 EffectManager（特效管理）

**职责**: 播放动画和音效，不阻塞游戏逻辑。

```javascript
const EffectManager = {
  /**
   * @param {string} type - "correct" | "wrong" | "combo_5" | "combo_10" | "combo_20"
   */
  trigger(type) {
    // 动画：按钮炸裂 / 屏幕闪色 / 连击数字跳动
    // 音效：叮 / 噗 / 爆炸
    // 关键：不阻塞 GameLoop，nextTick 继续
  }
};
```

### 6.6 Renderer（渲染器）

**职责**: Canvas 上绘制所有视觉内容。

```javascript
const Renderer = {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Question} question - 当前题目
   * @param {GameState} state - 游戏状态
   */
  drawGameScreen(ctx, question, state) {
    // 1. 背景（纯黑）
    // 2. 顶部：分数 + 连击
    // 3. 中间：指令文字（白色粗体大字）
    // 4. 底部：按钮（大圆角矩形）
    // 5. 底部：进度条（0.8s 倒计时）
  },

  drawResultScreen(ctx, state) {
    // 1. 正确数 / 30
    // 2. 最长连击
    // 3. 最快反应
    // 4. 雷达图（四维）
    // 5. "再来一局" 按钮
    // 6. "分享" 按钮
  }
};
```

---

## 7. 文件结构与部署

### 7.1 V1 项目结构

```
opposite-game/
├── index.html              # 单页入口（含 CSS + JS）
├── data/
│   └── questions-fallback.json   # 200+ 条降级题库
└── README.md               # 运行说明（给队友）

# V1 部署：直接把 index.html 拖进抖音小游戏开发者工具
```

### 7.2 V2 项目结构

```
opposite-game/
├── frontend/
│   ├── index.html          # 游戏页面（拆分后的版本）
│   ├── css/
│   │   └── game.css        # 样式（从 HTML 拆出）
│   └── js/
│       ├── game-engine.js  # 游戏主循环
│       ├── question-provider.js  # 题目获取（本地/AI）
│       ├── input-handler.js      # 触控事件
│       ├── judge.js              # 判定逻辑
│       ├── score-manager.js      # 分数/连击
│       ├── effect-manager.js     # 特效/音效
│       ├── renderer.js           # Canvas 渲染
│       ├── api-client.js         # 后端 API 调用 (V2 新增)
│       └── share-card.js         # 分享卡片绘制
├── backend/
│   ├── server.py           # Flask 主服务
│   ├── ai_client.py        # AI API 封装（通义千问/DeepSeek）
│   ├── requirements.txt    # Python 依赖
│   └── data/
│       ├── questions-fallback.json  # 题库（可从 V1 复用）
│       └── challenges/             # 挑战数据
├── assets/
│   ├── sounds/             # 音效文件 (MP3)
│   │   ├── ding.mp3
│   │   ├── dong.mp3
│   │   ├── pu.mp3
│   │   └── boom.mp3
│   └── images/             # 图片资源（可选）
├── docs/
│   ├── architecture.md     # 本文档
│   └── api-contract.json   # 接口定义
└── deploy/
    └── douyin-config.json  # 抖音小游戏配置
```

### 7.3 部署流程

```
1. 后端部署（如果需要）
   ├─ pip install -r requirements.txt
   ├─ 设置环境变量：TONGYI_API_KEY / DEEPSEEK_API_KEY
   └─ python server.py  # 启动在 0.0.0.0:5000

2. 前端部署
   ├─ 修改 api-client.js 中的 BASE_URL 为后端地址
   └─ 将 frontend/ 目录上传到抖音小游戏开发者工具

3. 测试
   ├─ 访问 http://localhost:5000/health 确认后端正常
   └─ 在抖音开发者工具中预览游戏
```

---

## 8. 接口契约（API Contract）

> 详见 `docs/api-contract.json`。以下为概要：

### 8.1 生成题目

```
POST /api/generate-question
Request:  { difficulty: int, exclude_types: string[] }
Response: { type, instruction_text, correct_action, options[], time_limit_ms }
```

### 8.2 分析表现

```
POST /api/analyze-performance
Request:  { answers: [{question_type, correct, reaction_time_ms}] }
Response: { radar: {reaction_speed, color_discrimination, ...}, weakness, recommended_difficulty }
```

### 8.3 分享文案

```
POST /api/generate-share-text
Request:  { score, max_combo, fastest_reaction_ms }
Response: { text: "...", hashtags: ["..."] }
```

### 8.4 挑战模式

```
POST /api/create-challenge
Request:  { player_name, score, questions[] }
Response: { challenge_code: "A1B2C3" }

GET /api/challenge/{code}
Response: { player_name, score, questions[] }
```

---

## 9. 风险与降级策略

| 风险 | 等级 | 降级方案 | 触发条件 |
|------|------|----------|----------|
| AI API 不可用 | 🔴 高 | 切换到 `questions-fallback.json` 本地题库 | API 超时 > 3s 或返回 5xx |
| 后端服务挂了 | 🟡 中 | V1 模式：前端直调 AI API + 本地题库 | 后端 3 次重试失败 |
| 网络断连 | 🟢 低 | 纯本地模式：只用本地题库，挑战模式不可用 | fetch 失败 |
| Canvas 性能不足 | 🟡 中 | 降低特效帧率（60fps → 30fps），减少粒子数量 | requestAnimationFrame 掉帧 |
| 抖音容器兼容性 | 🟡 中 | 用标准 Web API，避免抖音专用 API | 待实测 |
| 时间不够 | 🔴 高 | 严格 P0 > P1 > P2 优先级，P0 必须跑通 | 每个 checkpoint 评估 |

---

> **版本历史**
> - v1.0 (2026-06-06): 初始架构，覆盖 V1-V3 演进路线
