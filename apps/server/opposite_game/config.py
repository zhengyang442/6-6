"""
《反着来》应用配置

@author 四个菜鸟想上天团队
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env")


class Config:
    ROOT_DIR = ROOT_DIR
    WEB_DIR = ROOT_DIR / "apps" / "web"
    CONTENT_DIR = ROOT_DIR / "content"
    VAR_DIR = ROOT_DIR / "var"
    DB_PATH = Path(os.getenv("DATABASE_PATH", VAR_DIR / "game.db"))
    CHALLENGE_DIR = Path(
        os.getenv("CHALLENGE_DIR", VAR_DIR / "challenges")
    )
    FALLBACK_JSON = CONTENT_DIR / "questions" / "fallback.json"
    P0_QUESTIONS_JSON = CONTENT_DIR / "questions" / "p0-questions.json"

    PORT = int(os.getenv("PORT", "8888"))
    LOG_LEVEL = getattr(
        logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO
    )
    SOCKETIO_ASYNC_MODE = os.getenv("SOCKETIO_ASYNC_MODE") or None
    ONLINE_ROUND_TIME_MS = int(os.getenv("ONLINE_ROUND_TIME_MS", "3000"))
    ONLINE_MATCH_START_DELAY_MS = int(
        os.getenv("ONLINE_MATCH_START_DELAY_MS", "2000")
    )
    ONLINE_MAX_ROUNDS = int(os.getenv("ONLINE_MAX_ROUNDS", "20"))

    TONGYI_API_KEY = os.getenv("TONGYI_API_KEY", "")
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    TONGYI_URL = (
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    )
    DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
    AI_TIMEOUT_SECONDS = int(os.getenv("AI_TIMEOUT_SECONDS", "10"))
