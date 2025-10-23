from __future__ import annotations
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask
from .api import api_bp
from .errors import register_error_handlers
from .security import apply_security_headers
from .settings import Config

def create_app(config_object: type[Config] | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(config_object or Config)

    # Blueprints
    app.register_blueprint(api_bp)

    # Error handlers
    register_error_handlers(app)

    # Security headers
    app.after_request(apply_security_headers)

    # Logging
    if not app.debug and not app.testing:
        handler = RotatingFileHandler(app.config.get("LOG_FILE", "sdg_app.log"), maxBytes=1_000_000, backupCount=3)
        handler.setLevel(logging.INFO)
        app.logger.addHandler(handler)

    return app
