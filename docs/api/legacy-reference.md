# 《反着来》API 对接文档

> **给前端A同学** —— 对照本文档调用API，不需要看后端源码。

## 快速接入步骤

1. 确保后端已启动（双击 `start-dev.bat` 即可）
2. 在你项目的 `index.html` 中引入 `api-client.js`
3. 直接调用函数，已封装好

```html
<script type="module">
import { generateQuestion, analyzePerformance, generateShareText } from './api-client.js';

// 获取题目
const question = await generateQuestion({ difficulty: 1, type: "color" });
// 提交答案（前端自行判断对错）
const result = checkAnswer(userAction, question);
</script>
```

---

## API一览（5个端点）

| 端点 | 方法 | 用途 | 何时调用 |
|------|------|------|----------|
| `/health` | GET | 健康检查 | 页面加载时 |
| `/api/generate-question` | POST | 获取一道新题 | 每次出题时 |
| `/api/analyze-performance` | POST | 分析玩家表现 | 游戏结束后 |
| `/api/generate-share-text` | POST | 生成分享文案 | 游戏结束后 |
| `/api/create-challenge` | POST | 创建挑战 | 主动创建时 |
| `/api/challenge/<code>` | GET | 获取挑战 | 输入挑战码后 |

---

## 端点详情

### `POST /api/generate-question`

获取一道反直觉反应力题目。

```javascript
// 请求
const question = await generateQuestion({
  difficulty: 1,          // 1=简单 2=中等 3=困难  |  也支持 "easy"/"medium"/"hard"
  type: "color",           // "color" | "direction" | "action" | "any"（推荐）
  excludeTypes: []         // 要排除的类型列表，如 ["direction"]
});

// 响应结构
{
  "type": "color",
  "instruction_text": "点红色的",        // 屏幕显示的文字
  "correct_action": "tap_blue",          // 正确答案（前端用这个判断）
  "options": [                            // 按钮列表
    { "label": "红", "action": "tap_red", "color": "#FF0000" },
    { "label": "蓝", "action": "tap_blue", "color": "#0000FF" }
  ],
  "time_limit_ms": 1000,                  // 倒计时（毫秒）
  "source": "ai"                           // "ai"=AI出题 "fallback"=本地题库
}
```

**关键规则**：选项数量取决于题目类型
- `color` → 2个选项（红/蓝，绿/紫等）
- `direction` → 2个选项（←/→）
- `action` → 1个选项
- 其他 → 1-2个选项

**判断对错**：用户点击的 `action` 必须等于 `correct_action`

---

### `POST /api/analyze-performance`

游戏结束后分析表现，返回雷达图数据。

```javascript
// 请求
const analysis = await analyzePerformance([
  { question_type: "color", correct: true, reaction_time_ms: 423 },
  { question_type: "direction", correct: false, reaction_time_ms: 890 }
]);

// 响应
{
  "radar": {
    "reaction_speed": 85,          // 反应速度 (0-100)
    "color_discrimination": 70,    // 颜色辨别力
    "antisocial_thinking": 60,     // 反直觉思维力
    "pressure_resistance": 90      // 抗压能力
  },
  "weakness": "antisocial_thinking",   // 最弱维度
  "recommended_difficulty": 3,         // 推荐下次难度
  "comment": "反直觉思维有待提升，多练练！"
}
```

---

### `POST /api/generate-share-text`

生成分享到抖音/朋友圈的文案。

```javascript
// 请求
const share = await generateShareText({
  score: 250,
  maxCombo: 12,
  fastestReactionMs: 320
});

// 响应
{
  "text": "我在《反着来》答对了25/30题，最长连击12，最快320ms！高手，来挑战我 👉 输入代码 A1B2C3",
  "hashtags": ["反着来", "反直觉挑战", "反应力测试"],
  "share_image_prompt": "生成一张游戏分享卡片，分数 250，连击 12"
}
```

---

### `POST /api/create-challenge`

创建挑战，保存成绩，返回6位挑战码。

```javascript
// 请求
const challenge = await createChallenge({
  playerName: "小殷",
  score: 250,
  questions: [...]
});

// 响应
{
  "challenge_code": "A1B2C3",
  "share_url": "https://douyin.com/share/A1B2C3"
}
```

---

### `GET /api/challenge/:code`

通过挑战码获取挑战信息。

```javascript
// 请求
const challenge = await getChallenge("A1B2C3");

// 响应（结构同 createChallenge 返回时保存的）
{
  "code": "A1B2C3",
  "player_name": "小殷",
  "score": 250,
  "questions": [...],
  "created_at": "2026-06-06T11:00:00Z"
}
```

---

## 错误处理

所有异常都会抛出 Error，前端统一用 try-catch：

```javascript
try {
  const question = await generateQuestion();
} catch (err) {
  console.error("后端挂了:", err);
  // 降级：显示本地预存题目或"后端未连接"提示
}
```

---

## 注意事项

1. **题型持续变化**：`source` 可能是 `"ai"`（AI生成）或 `"fallback"`（本地题库），前端无需区分
2. **难度递增**：建议前4题用 `difficulty: "easy"` + `type: "color"`，之后逐渐增加难度
3. **并发调用**：generate-question 只能串行调用（因为有去重缓存）
4. **时间限制**：`time_limit_ms` 是毫秒，计时器到期则算答错
