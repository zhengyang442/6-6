"""
《反着来》AI 出题服务（通义千问 / DeepSeek）

@author 四个菜鸟想上天团队

[未使用] 当前未配置 API Key，AI 出题功能默认降级到本地题库。
如需启用：在 .env 中设置 TONGYI_API_KEY 或 DEEPSEEK_API_KEY。
"""
import json
import random
import re

import requests


TYPE_HINTS = {
    "direction": "方向类：指令方向与正确操作方向相反",
    "color": "颜色类：指令颜色与正确点击颜色相反",
    "action": "动作类：按照指令的相反动作作答",
    "double_neg": "双重否定类：先理解否定，再执行相反操作",
    "combo": "组合类：组合否定、方向或颜色干扰",
}


class AIQuestionClient:
    def __init__(self, config):
        self.config = config

    def generate(self, difficulty, exclude_types=None, force_type="any"):
        prompt = self._build_prompt(
            difficulty, exclude_types or [], force_type
        )
        raw = self._call(
            self.config["TONGYI_API_KEY"],
            self.config["TONGYI_URL"],
            "qwen-max",
            prompt,
            0.9,
        )
        if raw is None:
            raw = self._call(
                self.config["DEEPSEEK_API_KEY"],
                self.config["DEEPSEEK_URL"],
                "deepseek-chat",
                prompt,
                1.2,
            )
        return self._parse(raw) if raw else None

    def _call(self, api_key, url, model, prompt, temperature):
        if not api_key:
            return None
        try:
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "max_tokens": 500,
                },
                timeout=self.config["AI_TIMEOUT_SECONDS"],
            )
            if response.ok:
                return response.json()["choices"][0]["message"]["content"]
        except (requests.RequestException, KeyError, ValueError):
            return None
        return None

    @staticmethod
    def _build_prompt(difficulty, exclude_types, force_type):
        if force_type in TYPE_HINTS:
            question_type = force_type
        else:
            available = [
                name for name in TYPE_HINTS if name not in exclude_types
            ]
            question_type = random.choice(available or list(TYPE_HINTS))
        return f"""你是《反着来》反直觉反应游戏的题目生成器。
玩家必须执行屏幕指令的相反操作。当前难度：{difficulty}/5。
生成一道 {question_type} 题。{TYPE_HINTS[question_type]}
只返回 JSON：
{{
  "type": "{question_type}",
  "instruction_text": "题目文字",
  "correct_action_index": 0,
  "options": [
    {{"label": "选项1", "action": "动作1"}},
    {{"label": "选项2", "action": "动作2"}}
  ],
  "time_limit_ms": 1000
}}"""

    @staticmethod
    def _parse(raw_text):
        candidates = [raw_text]
        match = re.search(r"```json\s*([\s\S]*?)\s*```", raw_text)
        if match:
            candidates.insert(0, match.group(1))
        for candidate in candidates:
            try:
                question = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            required = (
                "type",
                "instruction_text",
                "correct_action_index",
                "options",
            )
            if all(field in question for field in required):
                question.setdefault("time_limit_ms", 1000)
                question.setdefault("source", "ai")
                return question
        return None
