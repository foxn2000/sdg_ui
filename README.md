# SDG Agent Interface

A modular Flask 3 application that serves a lightweight UI and a small REST API to import/export a YAML-based graph spec (MABEL-like). The original static UI is preserved while the backend is refactored for clarity, validation, and basic hardening.

- Backend: Flask 3, Pydantic v2, PyYAML
- UI: Static assets under `sdg_app/static` and template `sdg_app/templates/index.html`
- API: Import/Export YAML, curated model list, health check
- Security: Basic security headers and upload size limits
- Tests: Minimal API tests (pytest)

For the Japanese version of this document, see [README.JA.md](./README.JA.md).

## Features

- Clean architecture
  - Application factory `create_app` and Blueprint `api_bp`
  - Centralized error handlers and security headers
- Input validation with Pydantic v2 (`sdg_app/schemas.py`)
- YAML import/export via PyYAML with normalization rules (`sdg_app/services_yaml_io.py`)
- Security headers (CSP, X-Frame-Options, etc.), 4MB upload limit
- Minimal tests (`tests/test_api.py`)
- UI kept as static files (no build step)

## Project Layout

```
.
├─ LICENSE
├─ README.md
├─ README.JA.md
├─ requirements.txt
├─ wsgi.py
├─ sdg_app/
│  ├─ __init__.py                 # create_app, wiring
│  ├─ api.py                      # routes: UI, healthz, import/export, models
│  ├─ errors.py                   # JSON error handlers
│  ├─ schemas.py                  # Pydantic v2 models
│  ├─ security.py                 # security headers (CSP etc.)
│  ├─ services_yaml_io.py         # YAML ⇄ state helpers
│  ├─ settings.py                 # Config (env, limits, logging)
│  ├─ static/
│  │  ├─ css/style.css
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

## Quickstart

Prerequisites:
- Conda (Anaconda or Miniconda) or Python venv
- Python 3.11+ recommended

Conda example:

```bash
# 1) Create env
conda create -n sdg_ui python=3.11 -y

# 2) Activate
conda activate sdg_ui

# 3) Install deps
pip install -r requirements.txt

# 4) Run dev server (debug=True)
python wsgi.py
```

Open http://127.0.0.1:8024/ (server binds to 0.0.0.0:8024 in dev).

Alternative (venv + flask run):

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export FLASK_APP=wsgi:app
export FLASK_DEBUG=1
flask run --host=0.0.0.0 --port=8024
```

Production example (Gunicorn):

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8024 "wsgi:app"
```

## Configuration

Defined in `sdg_app/settings.py`:

- Environment variables
  - `SECRET_KEY` — session secret (default: `dev-not-secret`)
  - `LOG_FILE` — log file path (default: `sdg_app.log`)
- Other settings
  - `MAX_CONTENT_LENGTH = 4 * 1024 * 1024` (4MB uploads)
  - `JSON_AS_ASCII = False`
  - `TEMPLATES_AUTO_RELOAD = True`
- Logging
  - In non-debug/test modes, logs rotate to `LOG_FILE` via `RotatingFileHandler` (1MB, keep 3 backups)

## Security

`sdg_app/security.py` attaches basic hardening headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy` relaxed to allow inline scripts/styles to preserve the existing UI

If you add external resources, adjust CSP accordingly.

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

Response (success):
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

Possible errors:
- 400 `{"error":"No YAML provided","hint":"Upload as form-data 'file' or JSON body {yaml: '...'}"}`
- 400 `{"error":"invalid_yaml","message":"..."}`

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

- Response (success):
```json
{
  "ok": true,
  "yaml": "mabel:\n  version: 1.0\nmodels:\n- id: gpt-4o-mini\nblocks: []\n"
}
```

Possible errors:
- 400 `{"error":"expected_json"}`
- 400 `{"error":"invalid_state","message":"..."}`

5) GET `/api/models` — Static curated model list for UI
```bash
curl -s http://127.0.0.1:8024/api/models
```

- Default list includes entries like:
  - `gpt-4o-mini`, `gpt-4o`, `claude-3.5-sonnet`, `gemini-1.5-pro`, `llama-3.1-70b`
- Customize in `sdg_app/api.py` within `api_models()`.

### YAML normalization rules

Implemented in `sdg_app/services_yaml_io.py`:

- Inputs are parsed with `yaml.safe_load`.
- `models` may be:
  - a list of strings ⇒ converted to `{"id": "<str>"}` objects
  - a list of dicts ⇒ `id` inferred from `id` | `name` | `api_model` if present
- If `models` is absent/empty, unique models are derived from `blocks[*].model`.
- Output always includes `mabel.version = "1.0"`.
- `connections` are preserved only when non-empty.
- Dumped YAML uses `safe_dump(sort_keys=False, allow_unicode=True)`.

### Validation and Schemas

Defined in `sdg_app/schemas.py` (Pydantic v2):

- `ModelDef`: `{ id: str, provider?: str, label?: str, meta?: object }`
- `Block` (allows extra fields):
  - `{ type: string, exec?: number|null (default 1), model?: string, name?: string, prompt?: string, params?: object, extra?: object }`
- `GraphState`: `{ models: ModelDef[], blocks: Block[], connections: object[] }`
- `ImportRequest`: `{ yaml?: string }`
- `ExportRequest`: `{ state: GraphState }`

On `/api/import`, the normalized state is validated with `GraphState`. On `/api/export`, input is validated with `ExportRequest`.

### Error handling

Centralized JSON error responses (`sdg_app/errors.py`):
- 400: `{"error":"bad_request","message":"..."}` (generic)
- 413: `{"error":"payload_too_large","message":"Upload is too large."}`
- 404: `{"error":"not_found","message":"Resource not found."}`
- 500: `{"error":"server_error","message":"Unexpected error."}` (also logs with stack trace)

## Frontend notes

- No bundler; all assets are static under `sdg_app/static`.
- Main HTML is `sdg_app/templates/index.html`.
- Helpful UI tips (from in-app Help):
  - Drag blocks (AI / LOGIC / CODE / END) to the canvas
  - Click a node to edit, optional fields are under `<details>`
  - Space+drag to pan, Ctrl/⌘+wheel to zoom
  - Use Generate/Preview/Import for YAML

## Testing

`pytest` is not pinned in `requirements.txt`. Install and run:

```bash
pip install pytest
pytest -q
```

## Requirements

```
Flask>=3.0.0,<3.1
PyYAML>=6.0.1,<7.0
pydantic>=2.8,<3.0
```

## License

See [LICENSE](./LICENSE).
