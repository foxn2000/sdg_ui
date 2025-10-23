from __future__ import annotations
import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-not-secret")
    MAX_CONTENT_LENGTH = 4 * 1024 * 1024  # 4MB uploads
    JSON_AS_ASCII = False
    TEMPLATES_AUTO_RELOAD = True
    LOG_FILE = os.environ.get("LOG_FILE", "sdg_app.log")
