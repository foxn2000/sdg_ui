import json
from sdg_app import create_app

def test_health_and_models():
    app = create_app()
    client = app.test_client()

    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"

    r = client.get("/api/models")
    assert r.status_code == 200
    js = r.get_json()
    assert js["ok"] is True
    assert isinstance(js["models"], list) and len(js["models"]) >= 3

def test_import_export_roundtrip():
    app = create_app()
    client = app.test_client()

    yaml_text = """mabel:
  version: "1.0"
models:
  - id: gpt-4o-mini
blocks:
  - type: ai
    exec: 1
    model: gpt-4o-mini
"""

    r = client.post("/api/import", json={"yaml": yaml_text})
    assert r.status_code == 200
    state = r.get_json()["state"]
    assert state["blocks"][0]["type"] == "ai"

    r = client.post("/api/export", json={"state": state})
    assert r.status_code == 200
    out = r.get_json()["yaml"]
    assert "blocks:" in out
