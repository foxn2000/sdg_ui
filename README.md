# SDG Agent Interface

A modular Flask 3 application that serves a lightweight UI and a small REST API to import/export a YAML-based graph spec (MABEL-like). The UI is preserved from the original project while the backend was refactored for clarity and robustness.

- Backend: Flask 3, Pydantic v2, PyYAML
- UI: Static files under `sdg_app/static` and template `sdg_app/templates/index.html`
- API: Import/Export YAML, list curated models, health check
- Security: Basic hardening headers and payload size limits
- Tests: Minimal API tests (pytest)

For the Japanese version of this document, see README.JA.md.

## Features

- Modular structure with an application factory (`create_app`), Blueprints (`api_bp`), and clear separation of concerns
- Input validation via Pydantic v2 (`schemas.py`)
- YAML import/export centralized (`services_yaml_io.py`) using PyYAML
- Security headers (CSP, X-Frame-Options, etc.) and 4MB upload limit
- Basic tests (see `tests/test_api.py`)
- Original UI preserved so you can iterate safely

## Project Layout

```
.
├─ LICENSE
├─ README.md
├─ requirements.txt
├─ wsgi.py
├─ sdg_app/
│  ├─ __init__.py
│  ├─ api.py
│  ├─ errors.py
│  ├─ schemas.py
│  ├─ security.py
│  ├─ services_yaml_io.py
│  ├─ settings.py
│  ├─ static/
│  │  ├─ css/
│  │  │  └─ style.css
│  │  └─ js/
│  │     ├─ app.core.js
│  │     ├─ app.graph.js
│  │     ├─ app.js
│  │     ├─ app.ui.editor.js
│  │     ├─ app.ui.init.js
│  │     ├─ app.ui.js
│  │     ├─ app.ui.models.js
│  │     ├─ app.ui.nodes.js
│  │     └─ app.yaml.js
│  └─ templates/
│     └─ index.html
└─ tests/
   └─ test_api.py
```

## Quickstart (conda env: sdg_ui)

Prerequisites:
- Conda (Anaconda or Miniconda)
- Python 3.11+ recommended

Create and activate the environment named `sdg_ui`, install dependencies, and run the app:

```bash
# 1) Create environment
conda create -n sdg_ui python=3.11 -y

# 2) Activate
conda activate sdg_ui

# 3) Install deps
pip install -r requirements.txt

# 4) Run dev server
python wsgi.py
```

Open http://127.0.0.1:8024/ (server binds to 0.0.0.0:8024 in dev).

Production example (Gunicorn):

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8024 "wsgi:app"
```

## Configuration

- Environment variables (see `sdg_app/settings.py`)
  - `SECRET_KEY` — session secret (default: `dev-not-secret`)
  - `LOG_FILE` — log file path (default: `sdg_app.log`)
- Other settings
  - `MAX_CONTENT_LENGTH = 4 * 1024 * 1024` (4MB uploads)
  - `JSON_AS_ASCII = False`
  - `TEMPLATES_AUTO_RELOAD = True`
- Logging
  - In non-debug/test modes, logs rotate to `LOG_FILE` via `RotatingFileHandler`

## Security

`sdg_app/security.py` adds basic hardening headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy` with relaxed inline allowances for compatibility with existing UI

Adjust CSP if you add external resources.

## API

Base URL: `/`

Endpoints:

1) GET `/` — Serve UI (index.html)

2) GET `/healthz` — Health check
```bash
curl -s http://127.0.0.1:8024/healthz
# -> {"status":"ok"}
```

3) POST `/api/import` — Import YAML, returns normalized graph state

- Accepts:
  - multipart/form-data with file field name `file`
  - OR JSON body: `{"yaml":"...yaml text..."}`

Example (JSON):
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -H "Content-Type: application/json" \
  -d '{"yaml":"mabel:\n  version: 1.0\nmodels:\n  - id: gpt-4o-mini\nblocks: []\n"}'
```

Example (multipart):
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -F "file=@./example.yaml"
```

Response (on success):
```json
{
  "ok": true,
  "state": {
    "models": [ { "id": "gpt-4o-mini" } ],
    "blocks": [],
    "connections": []
  }
}
```

4) POST `/api/export` — Export YAML from state
- Request body:
```json
{
  "state": {
    "models": [ { "id": "gpt-4o-mini" } ],
    "blocks": [],
    "connections": []
  }
}
```

- Example:
```bash
curl -s -X POST http://127.0.0.1:8024/api/export \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "state": {
    "models": [{ "id": "gpt-4o-mini" }],
    "blocks": [],
    "connections": []
  }
}
JSON
```

- Response (on success):
```json
{
  "ok": true,
  "yaml": "mabel:\n  version: 1.0\nmodels:\n- id: gpt-4o-mini\nblocks: []\n"
}
```

5) GET `/api/models` — Static curated model list for UI
```bash
curl -s http://127.0.0.1:8024/api/models
```

Notes:
- Import normalization derives `models` from `blocks[*].model` if `models` is absent.
- Export always includes a `mabel.version` field and preserves `connections` only when non-empty.

## Validation and Schemas

Pydantic models (`sdg_app/schemas.py`):
- `ModelDef`: `{ id: str, provider?: str, label?: str, meta?: object }`
- `Block`: `{ type: str, exec?: int, model?: string, name?: string, prompt?: string, params?: object, extra?: object }`
- `GraphState`: `{ models: ModelDef[], blocks: Block[], connections: object[] }`
- `ImportRequest`: `{ yaml?: string }`
- `ExportRequest`: `{ state: GraphState }`

On `/api/import`, backend validates the normalized state with `GraphState`. On `/api/export`, backend validates the input as `ExportRequest` and returns YAML text.

## Development

- UI files live in `sdg_app/static` and `sdg_app/templates/index.html`. The backend was designed to keep the original UI logic intact.
- If you have a stricter MABEL spec, enhance `sdg_app/services_yaml_io.py` to add custom rules.
- Adjust curated models in `sdg_app/api.py` (`api_models`) to fit your environment.

## Testing

`pytest` is not pinned in `requirements.txt`. Install and run:

```bash
conda activate sdg_ui
pip install pytest
pytest -q
```

## License

See [LICENSE](./LICENSE).
