from __future__ import annotations
from typing import Any, Dict, List
from flask import Blueprint, jsonify, render_template, request
from .schemas import ImportRequest, ExportRequest, GraphState, ModelDef
from .services_yaml_io import yaml_to_state, state_to_yaml

api_bp = Blueprint("api", __name__)

@api_bp.get("/")
def index():
    return render_template("index.html")

@api_bp.get("/healthz")
def healthz():
    return jsonify(status="ok")

@api_bp.post("/api/import")
def api_import():
    # Accept YAML via multipart 'file' or JSON {yaml: '...'}
    text: str | None = None
    if "file" in request.files:
        text = request.files["file"].read().decode("utf-8", errors="replace")
    elif request.is_json and isinstance(request.json, dict):
        text = str(request.json.get("yaml", "") or "")

    if not text:
        return jsonify({"error": "No YAML provided", "hint": "Upload as form-data 'file' or JSON body {yaml: '...'}"}), 400

    try:
        state = yaml_to_state(text)
        # Validate with Pydantic (best-effort shape enforcement)
        GraphState(**state)
    except Exception as e:
        return jsonify({"error": "invalid_yaml", "message": str(e)}), 400

    return jsonify({"ok": True, "state": state})

@api_bp.post("/api/export")
def api_export():
    if not request.is_json:
        return jsonify({"error": "expected_json"}), 400
    try:
        payload = ExportRequest(**request.get_json(force=True))
        yaml_text = state_to_yaml(payload.state.model_dump())
        return jsonify({"ok": True, "yaml": yaml_text})
    except Exception as e:
        return jsonify({"error": "invalid_state", "message": str(e)}), 400

@api_bp.get("/api/models")
def api_models():
    # Static curated list; keep IDs simple for UI
    models = [
        ModelDef(id="gpt-4o-mini", provider="openai", label="GPT-4o mini").model_dump(),
        ModelDef(id="gpt-4o", provider="openai", label="GPT-4o").model_dump(),
        ModelDef(id="claude-3.5-sonnet", provider="anthropic", label="Claude 3.5 Sonnet").model_dump(),
        ModelDef(id="gemini-1.5-pro", provider="google", label="Gemini 1.5 Pro").model_dump(),
        ModelDef(id="llama-3.1-70b", provider="meta", label="Llama 3.1 70B").model_dump(),
    ]
    return jsonify({"ok": True, "models": models})
