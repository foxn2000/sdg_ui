# SDG Agent Interface — Improved

This is a refactored and modularized Flask application based on your original project.

## What changed (high level)
- **Modular structure** with an application factory, Blueprints, and clear separation of concerns.
- **Robust validation** using Pydantic for request payloads.
- **YAML import/export** centralized in backend services with PyYAML.
- **Security**: Standard security headers and payload size limits.
- **Tests**: Basic API tests (pytest) to guard against regressions.
- **UI preserved**: Your original `templates/index.html`, `static/js/app.js`, and `static/css/style.css` are kept as-is to avoid breaking UI logic. You can iterate safely from here.

## Project layout
```
improved_app/
  sdg_app/
    __init__.py
    api.py
    errors.py
    security.py
    services_yaml_io.py
    settings.py
    templates/
      index.html            # Copied from original
    static/
      css/style.css         # Copied from original
      js/app.js             # Copied from original
  wsgi.py
  requirements.txt
  tests/
    test_api.py
  README.md
```

## Run locally
```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python wsgi.py
```

Then open http://127.0.0.1:8024/

## Configuration
Environment variables:
- `SECRET_KEY` — session secret (default: dev-not-secret)
- `LOG_FILE` — log file path (default: sdg_app.log)

## Notes
- The `/api/models` endpoint returns a static, curated list. Adjust as needed.
- The YAML normalization is best-effort; uncommon fields are preserved under `extra` by UI (if applicable). Improve `services_yaml_io.py` to fit your exact MABEL spec.
