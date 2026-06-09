# 《反着来》本地题库模板

> 版本：v1.0.0 | 最后更新：2026-06-06
> **用途**：AI API 不可用时的降级题库。每个题型至少填 8 条，目标总量 200+ 条。

---

## 📋 填写说明（策划必读）

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 题型：`direction`/`color`/`action`/`double_neg`/`combo` |
| `instruction_text` | string | ✅ | 展示给玩家的指令文字 |
| `correct_action` | string | ✅ | 正确答案的动作标识，必须与 `options` 中某个 `action` 完全匹配 |
| `options` | array | ✅ | 按钮选项列表，见下方各题型说明 |
| `time_limit_ms` | int | ✅ | 倒计时毫秒数 |
| `difficulty` | int | ✅ | 难度 1-5（1=最简单，5=最难）|
| `tip` | string | 选填 | 填题备注，给队友看，不会出现在游戏里 |

### 各题型 options 格式

**方向类（direction）**— options 长度 = 2
```json
"options": [
  { "label": "向左", "action": "swipe_left" },
  { "label": "向右", "action": "swipe_right" }
]
```

**颜色类（color）**— options 长度 = 2，每个含 `color` 字段（hex 色值）
```json
"options": [
  { "label": "红", "action": "tap_red", "color": "#EE4444" },
  { "label": "蓝", "action": "tap_blue", "color": "#4444DD" }
]
```

**动作类（action）**— options 长度 = 1
```json
"options": [
  { "label": "点我", "action": "tap_any", "color": "#AAAAAA" }
]
```

**双重否定（double_neg）**— options 长度 = 1，同动作类

**组合类（combo）**— options 长度 = 2，同方向类或颜色类

### 时间限制参考

| 题型 | 推荐 time_limit_ms |
|------|---------------------|
| direction | 700-800 |
| color | 900-1000 |
| action | 800-1200 |
| double_neg | 800-1000（难度高，可以给稍长时间）|
| combo | 700-900 |

---

## 📝 题目示例（可以直接复制修改）

### 方向类（direction）

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
  "difficulty": 1,
  "tip": "指令说向左，正确操作是向右"
}
```

```json
{
  "type": "direction",
  "instruction_text": "不要向右滑",
  "correct_action": "swipe_left",
  "options": [
    { "label": "向左", "action": "swipe_left" },
    { "label": "向右", "action": "swipe_right" }
  ],
  "time_limit_ms": 800,
  "difficulty": 3,
  "tip": "「不要向右滑」= 做向左滑"
}
```

### 颜色类（color）

```json
{
  "type": "color",
  "instruction_text": "点红色的",
  "correct_action": "tap_blue",
  "options": [
    { "label": "红", "action": "tap_red", "color": "#EE4444" },
    { "label": "蓝", "action": "tap_blue", "color": "#4444DD" }
  ],
  "time_limit_ms": 1000,
  "difficulty": 1,
  "tip": "指令说点红色的，正确是点蓝色的"
}
```

```json
{
  "type": "color",
  "instruction_text": "不要点绿色的",
  "correct_action": "tap_yellow",
  "options": [
    { "label": "绿", "action": "tap_green", "color": "#44AA44" },
    { "label": "黄", "action": "tap_yellow", "color": "#DDDD44" }
  ],
  "time_limit_ms": 900,
  "difficulty": 3,
  "tip": "「不要点绿色」= 点黄色"
}
```

### 动作类（action）

```json
{
  "type": "action",
  "instruction_text": "别动",
  "correct_action": "tap_any",
  "options": [
    { "label": "点我", "action": "tap_any", "color": "#AAAAAA" }
  ],
  "time_limit_ms": 1000,
  "difficulty": 2,
  "tip": "「别动」= 要立刻点按钮"
}
```

```json
{
  "type": "action",
  "instruction_text": "立刻点",
  "correct_action": "tap_any",
  "options": [
    { "label": "点我", "action": "tap_any", "color": "#AAAAAA" }
  ],
  "time_limit_ms": 600,
  "difficulty": 2,
  "tip": "「立刻点」= 不要点（反着来）"
}
```

### 双重否定（double_neg）⚠️ 难度最高

```json
{
  "type": "double_neg",
  "instruction_text": "不要不点",
  "correct_action": "tap_any",
  "options": [
    { "label": "点我", "action": "tap_any", "color": "#AAAAAA" }
  ],
  "time_limit_ms": 1000,
  "difficulty": 4,
  "tip": "「不要不点」= 双重否定 = 要立刻点"
}
```

```json
{
  "type": "double_neg",
  "instruction_text": "别不碰",
  "correct_action": "tap_any",
  "options": [
    { "label": "点我", "action": "tap_any", "color": "#AAAAAA" }
  ],
  "time_limit_ms": 900,
  "difficulty": 5,
  "tip": "「别不碰」= 双重否定 = 要碰 = 立刻点"
}
```

### 组合类（combo）

```json
{
  "type": "combo",
  "instruction_text": "不要点红色的",
  "correct_action": "tap_blue",
  "options": [
    { "label": "红", "action": "tap_red", "color": "#EE4444" },
    { "label": "蓝", "action": "tap_blue", "color": "#4444DD" }
  ],
  "time_limit_ms": 800,
  "difficulty": 3,
  "tip": "「不要点红色」= 点蓝色"
}
```

```json
{
  "type": "combo",
  "instruction_text": "别向左滑",
  "correct_action": "swipe_right",
  "options": [
    { "label": "向左", "action": "swipe_left" },
    { "label": "向右", "action": "swipe_right" }
  ],
  "time_limit_ms": 800,
  "difficulty": 3,
  "tip": "「别向左滑」= 向右滑"
}
```

---

## ✅ 填题检查清单（提交前自查）

- [ ] `correct_action` 能在 `options` 里找到对应 `action`
- [ ] `options` 字段格式符合该题型的规范（方向类2个、颜色类2个含color、动作类1个）
- [ ] `time_limit_ms` 在推荐范围内
- [ ] `difficulty` 在 1-5 之间
- [ ] JSON 格式正确（用 https://jsonlint.com 校验）
- [ ] 没有 trailing comma（JSON 不支持）
- [ ] 每个题型至少填了 8 条

---

## 📊 题型分布目标（总量 200+）

| 题型 | 目标条数 | 难度分布 |
|------|----------|----------|
| direction | 50 | 1-3 各 15，4-5 各 10 |
| color | 50 | 1-3 各 15，4-5 各 10 |
| action | 40 | 1-3 各 12，4-5 各 8 |
| double_neg | 30 | 3-5，难度偏高 |
| combo | 30 | 2-5，需要两步推理 |

---

*填完后提交 PR 或发给项目维护者合并到项目里。*
