"""
《反着来》Flask 应用工厂

@author 四个菜鸟想上天团队
"""
import logging

from flask import Flask
from flask_cors import CORS

from .config import Config
from .extensions import socketio
from .realtime.game import register_socket_handlers
from .repositories.leaderboard import LeaderboardRepository
from .routes.api import api
from .routes.web import web
from .services.questions import QuestionService


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    logging.basicConfig(
        level=app.config["LOG_LEVEL"],
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    CORS(app, origins=["*"])
    socketio.init_app(
        app,
        cors_allowed_origins="*",
        async_mode=app.config.get("SOCKETIO_ASYNC_MODE"),
    )

    app.extensions["question_service"] = QuestionService(
        app.config["P0_QUESTIONS_JSON"],
        fallback_path=app.config.get("FALLBACK_JSON"),
    )
    app.extensions["leaderboard_repository"] = LeaderboardRepository(
        app.config["DB_PATH"]
    )
    app.extensions["leaderboard_repository"].initialize()

    app.register_blueprint(api)
    app.register_blueprint(web)
    register_socket_handlers(socketio)
    return app
