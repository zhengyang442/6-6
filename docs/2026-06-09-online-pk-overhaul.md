# 2026-06-09 在线 PK 全面整改 & 首页精简

## 一、首页 UI 精简

### 删除的入口
| 按钮 | 状态 | 说明 |
|------|------|------|
| AI 神经挑战 | 移除 | 代码保留，标注 `[未使用]` |
| 每日挑战 | 移除 | 代码保留，标注 `[未使用]` |

### 保留的入口（最终布局）
```
闯关模式              （全宽）
接入在线神经 ONLINE PK （全宽）
双人神经互换 | 神经校准 （左右分栏）
事故档案     | 传播病例 （左右分栏）
```

### 受影响的文件
- `apps/web/src/main.js`
- `apps/web/src/services/api-client.js`
- `apps/web/src/data/question-bank.js`

### 共同作者标记
在以下文件头部添加了 `@author 四个菜鸟想上天团队`：
- `apps/web/src/main.js`
- `apps/web/src/services/api-client.js`
- `apps/web/src/data/question-bank.js`
- `apps/server/opposite_game/__init__.py`
- `apps/server/opposite_game/config.py`
- `apps/server/opposite_game/services/ai.py`

---

## 二、在线 PK 问题诊断（审查发现）

审查范围：服务端 `game.py` + `questions.py`，前端 `online-pk.js` + `main.js`。

### 🔴 问题 1：服务端题库只有 20 道题，PK 大量重复
- **根因**：`game.py` 每轮调用 `service.fallback()` 从 `fallback.json` 随机抽题，该文件仅 20 道，其中匹配 difficulty=1 的仅 11 道。20 轮 PK 平均每道题出现近 2 次。
- **对比**：前端单机模式使用 `question-pool/*Questions.js`，题库数百道且经 P0 稳定性筛选。**同一游戏两套题库，体验割裂**。

### 🔴 问题 2：无难度递进
- **根因**：`service.fallback()` 固定传 `difficulty=1`，20 轮从头到尾难度不变。
- **对比**：单机闯关模式有 6 关递进 (easy→medium→hard→boss→motion)，PK 毫无难度曲线。

### 🔴 问题 3：积分只有 +1/-0，combo 和速度不参与计分
- **根因**：服务端记录了 `combo` 和 `reaction_time_ms` 但**仅用于统计**，不入计分公式。正确只 +1，错误 +0。
- **对比**：单机有 combo bonus、speed label、最快反应展示。PK 只有干巴巴的正确题数，高分低分拉不开差距。

### 🔴 问题 4：前端 PK 渲染完全绕过 QuestionBank
- **根因**：PK 题目由服务端推送，`drawOnlinePkPlaying()` 直接渲染，**从未调用 `QuestionBank.getQuestions()` 或 `normalizeQuestion()`**。
- **后果**：
  - 字段格式完全依赖服务端 snake_case（`instruction_text` vs 前端 camelCase `instructionText`）
  - 选项缺少 `action` fallback（`option.action || option.id`），导致部分题目按钮不可点
  - 服务端格式一变，前端 PK 渲染就崩
  - 无法复用前端题目筛选/规范化逻辑

### 🟡 问题 5：服务端纯随机抽取，不防重复
- **根因**：`random.choice(pool)` 无去重，同一题型可能连续出现 5 次，同一道题可能反复出现。

### 🟡 问题 6：源数据格式不统一（Format A / Format B）
- 题目 JSON 中存在两套格式：
  - **Format A**：`options` 为字符串，`correctAction` 为数组（如 `["color_stroop", "tap"]`）
  - **Format B**：`options` 为数组，`correctAction` 为字符串
- `isStableP0()` 初始版本未拦截非数组 options，导致 25 道格式异常题目混入 P0 池。

### 🟡 问题 7：前端后端接口割裂
- 前端由 `@zhengyang442` 维护，后端由另一同学维护，两端缺少统一规范。
- **体现**：字段命名不一致（camelCase vs snake_case）、题库独立维护、规范化逻辑各写一套。

### 🟡 问题 8：8 秒限时全链路不一致
- 服务端 `config.py` 默认 `"8000"`，`game.py` 常量 `8000`，前端 `online-pk.js` 3 处 `|| 8000` 兜底，`main.js` 初始化 `8000`。
- 全链路共 **6 处硬编码**，修改需同步改动且容易遗漏。

---

## 三、在线 PK 五大修复

### 修复 1：统一题库
- **问题**：服务端 PK 只从 `fallback.json` 随机抽题（20 道），频繁重复；前端单机模式用数百道 P0 题库
- **方案**：服务端改用前端同源的 P0 题库
  - 扩展 `scripts/generate-question-pool.mjs`，新增 `isStableP0()` 筛选函数，输出 140 道 P0 题目到 `content/questions/p0-questions.json`
  - `QuestionService` 改为从 `p0-questions.json` 加载（原 `fallback.json` 降级兜底）
  - 前端新增 `normalizeOnlineQuestion()`，将服务端 snake_case 转为前端标准格式

### 修复 2：难度递进曲线
- **问题**：20 轮 PK 全程固定 difficulty=1，无难度变化
- **方案**：`game.py` 新增 `_difficulty_for_round()`：
  ```
   1- 5 轮 → easy   (difficulty=1)
   6-12 轮 → medium (difficulty=2)
  13-18 轮 → hard   (difficulty=3)
  19-20 轮 → boss   (difficulty=4)
  ```

### 修复 3：连击 + 速度积分
- **问题**：积分只有 +1/-0，记录的 combo 不参与计分，reaction_time 也不参与
- **方案**：`on_submit_answer()` 计分逻辑改为：
  ```python
  combo_bonus = combo // 3          # 每 3 连击 +1
  speed_bonus = 1 if elapsed < 2s else 0
  round_score = 1 + combo_bonus + speed_bonus
  ```

### 修复 4：题目去重
- **问题**：纯随机抽取，同一题型可能连续出现
- **方案**：Room 维护 `used_question_ids` 集合，每轮传给 `fallback(exclude_ids=...)`

### 修复 5：前端规范化
- **问题**：PK 题目绕过 `QuestionBank.normalizeQuestion()`，渲染代码依赖服务端原始格式
- **方案**：`online-pk.js` 新增 `normalizeOnlineQuestion()`，将服务端字段转为前端标准格式（含 `action: option.action || option.id` fallback）

---

## 四、PK 平局裁决 & 前端展示

### 总用时决胜负
- Room 新增 `total_reaction_time` 累计，每道题结束后累加实际耗时（含超时按满时间算）
- `finish_room_locked()`：分数相同时，总用时少者胜
- 前端 `game_over` 接收 `total_time_ms` 和 `max_combo`，结果页展示

### 前端结果展示
- `drawOnlinePkResult()`：显示总分、总用时、最大连击数

---

## 五、回合时间 8s → 3s

### 全链路修改
| 层级 | 文件 | 改动行 |
|------|------|--------|
| 环境变量默认值 | `.env.example` | `8000` → `3000` |
| 配置默认值 | `config.py:34` | `"8000"` → `"3000"` |
| 服务端代码兜底 | `game.py:11` | `8000` → `3000` |
| 前端 3 处兜底 | `online-pk.js:41,128,129` | `8000` → `3000` |
| 前端状态初始化 | `main.js:158` | `8000` → `3000` |

### 确认不受影响
- 单机模式时间来自 `LEVEL_CONFIGS` 和题目自身的 `time_limit_ms`，与 `ONLINE_ROUND_TIME_MS` 无关

---

## 六、涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/generate-question-pool.mjs` | 修改 +80 行 | 新增 `isStableP0()` / `normalizeOptions()`，输出 p0-questions.json |
| `content/questions/p0-questions.json` | 新建 | 140 道 P0 题目（easy:75, medium:35, hard:25, boss:5） |
| `apps/server/opposite_game/services/questions.py` | 重写 | 改用 P0 题库，支持 difficulty 筛选和 exclude_ids 去重 |
| `apps/server/opposite_game/realtime/game.py` | 修改 +60 行 | 难度递进、combo/speed 计分、去重、总用时裁决、3s 默认值 |
| `apps/server/opposite_game/config.py` | 修改 3 行 | 新增 P0_QUESTIONS_JSON 路径；ONLINE_ROUND_TIME_MS 默认 3000 |
| `apps/server/opposite_game/__init__.py` | 修改 1 行 | QuestionService 实例化传参 |
| `apps/web/src/modes/online-pk.js` | 修改 +60 行 | normalizeOnlineQuestion()、结果捕获、3s 兜底 |
| `apps/web/src/main.js` | 修改多处 | 删除双按钮、co-author 标记、3s 时间、结果展示、事故档案/传播病例左右布局 |
| `apps/web/src/services/api-client.js` | 修改 | co-author + `[未使用]` 标记 |
| `apps/web/src/data/question-bank.js` | 修改 | co-author 标记 |
| `apps/server/opposite_game/services/ai.py` | 修改 | co-author 标记 |
| `.env.example` | 修改 | ONLINE_ROUND_TIME_MS=3000 |

---

## 七、AI API 调用移除（离线化）

### 背景
原系统依赖通义千问 (Tongyi) / DeepSeek API 实时生成题目，存在三个问题：
- 需申请 API Key，配置门槛高
- API 调用有延迟（超时 10s），影响体验
- 生成题目质量不稳定，格式五花八门（`correctAction` 为数组/字符串混用等）

### 改动

| 模块 | 文件 | 操作 |
|------|------|------|
| AI 出题服务 | `apps/server/opposite_game/services/ai.py` | 整体标记 `[未使用]`，无 API Key 时默认降级本地题库 |
| AI 挑战 API | `apps/web/src/services/api-client.js` | `fetchAIQuestionBatch()` 标记 `[未使用]` |
| 每日挑战 API | `apps/web/src/services/api-client.js` | `getDailyChallenge()` 标记 `[未使用]` |
| 本地题库生成 | `scripts/generate-question-pool.mjs` | 从 `content/questions/*.json` 本地文件构建，输出 JS（浏览器）和 JSON（服务端）两份题库 |
| 服务端题库 | `content/questions/p0-questions.json` | 生成产物 — 140 道 P0 题目，服务端 PK 直接读取 |

### 题库数据流（当前）
```
content/questions/*.json  ──[generate-question-pool.mjs]──┬── apps/web/src/data/question-pool/*.js  (浏览器)
                   (本地源数据)                            └── content/questions/p0-questions.json   (服务端)
```

即 **完全不依赖外部 API**，题目全部来自本地 JSON，build 脚本在开发时一次性生成。

---

## 八、待办 / 已知限制

- **部署**：当前仍需本地手动启动 Python 服务端，待评估 Render/阿里云等云端部署方案
- **重启生效**：`config.py` 在服务启动时加载，修改任何配置后需重启 `python run.py`
- **题库更新**：若修改前端题库，需重新运行 `node scripts/generate-question-pool.mjs` 同步 P0 JSON
