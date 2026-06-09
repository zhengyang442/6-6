# API 契约文档

> 《反着来》前后端接口定义 | 版本：v1.0.0

**任何改动必须更新此文档并通知全队。**

---

## 基路径

| 环境 | 地址 |
|------|------|
| 本地开发 | `http://localhost:5000` |
| 线上（待填） | `https://your-deploy-url.com` |

---

## 接口列表

### 1. 健康检查

`GET /health`

前端启动时调用一次，确认后端在线。

**响应示例**
```json
{ "status": "ok", "version": "1.0.0" }
```

---

### 2. 获取题目

`POST /api/generate-question`

AI 生成题目，失败则降级到本地题库。前端每道题开始前调用。

**请求体**
```json
{
  "difficulty": 1,
  "exclude_types": ["direction", "color"]
}
```
- `difficulty`：难度等级 1-5，对应 30 题中的阶段（必填）
- `exclude_types`：最近 3 题的类型，避免连续重复（选填）

**响应体**
```json
{
  "type": "direction",
  "instruction_text": "向左滑",
  "correct_action": "swipe_right",
  "options": [
    { "label": "向左", "action": "swipe_left" },
    { "label": "向右", "action": "swipe_right" }
  ],
  "time_limit_ms": 800,
  "source": "ai"
}
```

**字段说明**
| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `direction`/`color`/`action`/`double_neg`/`combo` |
| `instruction_text` | string | 展示给玩家的指令文字 |
| `correct_action` | string | 正确答案的动作标识 |
| `options` | array | 按钮选项，颜色类含 `color` 字段（hex）|
| `time_limit_ms` | int | 倒计时毫秒，方向类 800，其他 1000 |
| `source` | string | `ai` 或 `fallback`，便于调试 |

---

### 3. 分析表现

`POST /api/analyze-performance`

游戏结束后调用，传入答题记录，返回四维雷达图数据。

**请求体**
```json
{
  "answers": [
    { "question_type": "direction", "correct": true, "reaction_time_ms": 420 },
    { "question_type": "color", "correct": false, "reaction_time_ms": 780 }
  ]
}
```

**响应体**
```json
{
  "radar": {
    "reaction_speed": 82,
    "color_discrimination": 75,
    "antisocial_thinking": 68,
    "pressure_resistance": 90
  },
  "weakness": "antisocial_thinking",
  "recommended_difficulty": 3,
  "comment": "你在反直觉思维上还有提升空间，继续加油！"
}
```

---

### 4. 生成分享文案

`POST /api/generate-share-text`

结算后调用，生成个性化分享到抖音的文案。

**请求体**
```json
{
  "score": 27,
  "max_combo": 12,
  "fastest_reaction_ms": 320,
  "weakness": "antisocial_thinking"
}
```

**响应体**
```json
{
  "text": "我在《反着来》里答对了 27 题，最快反应 320ms！反直觉思维你是认真的吗？来挑战我 👉 输入代码 A1B2C3",
  "hashtags": ["反着来", "反直觉挑战", "反应力测试", "抖音AI创变者"],
  "share_image_prompt": "生成一张带有分数 27 和连击 12 的炫酷分享卡片"
}
```

---

### 5. 创建挑战

`POST /api/create-challenge`

玩家完成游戏后，将其题目和成绩保存，生成 6 位挑战码发给好友。

**请求体**
```json
{
  "player_name": "小殷",
  "score": 27,
  "questions": [/* 本局题目列表 */]
}
```

**响应体**
```json
{
  "challenge_code": "A1B2C3",
  "share_url": "https://douyin.com/share/A1B2C3"
}
```

---

### 6. 获取挑战

`GET /api/challenge/{code}`

好友输入挑战码后，前端调此接口获取原始题目和发起者成绩。

**路径参数**：`code` — 6 位大写字母数字组合，如 `A1B2C3`

**响应体**
```json
{
  "player_name": "小殷",
  "score": 27,
  "questions": [/* 题目列表 */],
  "created_at": "2026-06-06T11:00:00Z"
}
```

**错误**：404 — 挑战码不存在或已过期

---

## 题目类型与正确答案对照表

| type | correct_action 示例 | 说明 |
|------|---------------------|------|
| `direction` | `swipe_left` 或 `swipe_right` | 指令说"向左滑"→ 正确是"向右滑" |
| `color` | `tap_red` / `tap_blue` 等 | 指令说"点红色的"→ 正确是"点蓝色的" |
| `action` | `tap_any` | 指令说"别动"→ 正确是"立刻点" |
| `double_neg` | `tap_any` | 指令说"不要不点"→ 正确是"点一下" |
| `combo` | `tap_{color}` | 指令说"不要点红色的"→ 正确是"点蓝色的" |

---

## 降级策略

| 场景 | 处理方式 |
|------|----------|
| AI API 超时（>3s） | 自动切换本地 `questions-fallback.json` |
| 后端服务不可用 | 前端切 V1 模式，直调 AI API + 本地题库 |
| 网络断连 | 纯本地模式，挑战模式不可用 |

---

*最后更新：2026-06-06*
