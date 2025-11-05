# SDG Agent Interface (MABEL Studio)

A visual YAML builder for AI agents based on Flask 3. This application provides an interactive node-based editor for creating and managing MABEL (Multi-Agent Building Engine Language) workflows with a clean, modular backend architecture.

- **Backend**: Flask 3, Pydantic v2, PyYAML
- **Frontend**: Visual node editor with pan/zoom, auto-layout, and live wiring
- **API**: Import/Export YAML, curated model list, health check
- **Security**: Basic security headers and upload size limits
- **Tests**: Minimal API tests (pytest)

For the Japanese version of this document, see [README.JA.md](./README.JA.md).

## Features

### Visual Editor
- **Node-based interface**: Drag and drop AI, LOGIC, CODE, START, and END blocks
- **Auto-wiring**: Automatic connection detection based on input/output references (e.g., `{VariableName}`)
- **Auto-layout**: Organize blocks by execution order with vertical centering
- **Pan & Zoom**: Navigate large workflows with Space+drag panning and Ctrl/⌘+wheel zooming
- **Keyboard shortcuts**: Delete blocks, nudge positions, and control zoom
- **Live preview**: Real-time YAML generation and preview

### Block Types
- **START**: Entry point with `UserInput` output
- **AI**: LLM-based prompts with model selection, system/user prompts, and output extraction
- **LOGIC**: Conditional logic (`if/and/or/not`) and loops (`for`) with filtering and mapping
- **CODE**: Python script execution with input/output mapping
- **END**: Workflow termination with final output payload

### MABEL v2 Support
- **Runtime settings**: Timeout, max_steps, trace configuration
- **Budget management**: Token limits per model and total budget
- **Global variables**: Shared variables across workflows
- **Advanced configuration**: Retry policies, error handling, and logging

### Model Management
- **Multiple AI models**: Configure OpenAI, Claude, Gemini, and custom models
- **Request defaults**: Temperature, top_p, max_tokens, and retry settings
- **Save/Load/Reset**: Browser-based model configuration persistence
- **YAML export**: Export model settings separately

### Backend Architecture
- **Clean architecture**: Application factory `create_app` and Blueprint `api_bp`
- **Input validation**: Pydantic v2 schemas for type safety (`sdg_app/schemas.py`)
- **YAML normalization**: Intelligent import/export with model inference (`sdg_app/services_yaml_io.py`)
- **Security headers**: CSP, X-Frame-Options, and other hardening measures
- **Error handling**: Centralized JSON error responses with proper status codes
- **Logging**: Rotating file handler for production environments

## Project Layout

```
.
├─ LICENSE
├─ README.md
├─ README.JA.md
├─ requirements.txt
├─ wsgi.py
├─ sdg_app/
│  ├─ __init__.py                 # create_app factory, application wiring
│  ├─ api.py                      # routes: UI, healthz, import/export, models
│  ├─ errors.py                   # JSON error handlers
│  ├─ schemas.py                  # Pydantic v2 models
│  ├─ security.py                 # security headers (CSP, etc.)
│  ├─ services_yaml_io.py         # YAML ⇄ state conversion/normalization
│  ├─ settings.py                 # config (env, limits, logging)
│  ├─ static/
│  │  ├─ css/style.css            # Frutiger Aero theme styling
│  │  └─ js/
│  │     ├─ app.core.js           # State management & utilities
│  │     ├─ app.graph.js          # Graph/wiring logic
│  │     ├─ app.js                # (legacy/monolithic, see new modules)
│  │     ├─ app.ui.editor.js      # Block editor forms
│  │     ├─ app.ui.init.js        # Initialization & event binding
│  │     ├─ app.ui.models.js      # Model panel UI
│  │     ├─ app.ui.nodes.js       # Node rendering & canvas interactions
│  │     ├─ app.ui.v2settings.js  # MABEL v2 settings modal
│  │     └─ app.yaml.js           # YAML import/export logic
│  └─ templates/
│     └─ index.html
└─ tests/
   └─ test_api.py
```

## Quickstart

Prerequisites:
- Conda (Anaconda or Miniconda) or Python venv
- Python 3.11+ recommended

### Conda example:

```bash
# 1) Create environment
conda create -n sdg_ui python=3.11 -y

# 2) Activate
conda activate sdg_ui

# 3) Install dependencies
pip install -r requirements.txt

# 4) Run dev server (debug=True)
python wsgi.py
```

Open http://127.0.0.1:8024/ (server binds to 0.0.0.0:8024 in dev).

### Alternative (venv + flask run):

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export FLASK_APP=wsgi:app
export FLASK_DEBUG=1
flask run --host=0.0.0.0 --port=8024
```

### Production example (Gunicorn):

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8024 "wsgi:app"
```

## Configuration

Defined in `sdg_app/settings.py`:

- **Environment variables**
  - `SECRET_KEY` — session secret (default: `dev-not-secret`)
  - `LOG_FILE` — log file path (default: `sdg_app.log`)
- **Other settings**
  - `MAX_CONTENT_LENGTH = 4 * 1024 * 1024` (4MB upload limit)
  - `JSON_AS_ASCII = False`
  - `TEMPLATES_AUTO_RELOAD = True`
- **Logging**
  - In non-debug/test modes, logs rotate to `LOG_FILE` via `RotatingFileHandler` (1MB, keep 3 backups)

## Usage

### Visual Editor Workflow

1. **Configure Models** (right panel, top):
   - Add AI models with API keys, base URLs, and request defaults
   - Save/Load configurations to browser storage
   - Export model settings as YAML

2. **Build Workflow** (main canvas):
   - Drag blocks from library (right panel, bottom) to canvas
   - Click blocks to edit properties (prompts, conditions, code, etc.)
   - Blocks auto-wire based on `{OutputName}` placeholders in prompts/conditions
   - Use **Auto Layout** to organize by execution order
   - **Navigation**:
     - Pan: Space + drag, middle mouse button, or scroll wheel
     - Zoom: Ctrl/⌘ + wheel, or use zoom HUD (−/100%/+/Fit)
     - Delete: Select block and press Delete/Backspace
     - Nudge: Select block and use arrow keys

3. **Configure v2 Settings** (optional):
   - Click ⚙️ button to open MABEL v2 settings
   - Set runtime limits, budgets, and global variables

4. **Export/Import**:
   - **YAML Generate**: Download complete workflow as YAML
   - **YAML Preview**: View generated YAML without downloading
   - **YAML Import**: Upload or drag-drop `.yaml`/`.yml` files
   - **Models YAML**: Export only model configurations

### Keyboard Shortcuts

- **Delete/Backspace**: Delete selected block
- **Arrow keys**: Nudge selected block (24px grid snap)
- **Ctrl/⌘ + +**: Zoom in
- **Ctrl/⌘ + -**: Zoom out
- **Ctrl/⌘ + 0**: Reset zoom to 100%
- **Space + drag**: Pan canvas
- **Enter** (on library item): Add block to canvas

## API

Base URL: `/`

### Endpoints:

#### 1) GET `/` — Serve UI (index.html)

#### 2) GET `/healthz` — Health check
```bash
curl -s http://127.0.0.1:8024/healthz
# -> {"status":"ok"}
```

#### 3) POST `/api/import` — Import YAML, returns normalized graph state

**Accepts**:
- multipart/form-data with file field name `file`
- OR JSON body: `{"yaml":"...yaml text..."}`

**JSON example**:
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -H "Content-Type: application/json" \
  -d '{"yaml":"mabel:\n  version: 1.0\nmodels:\n  - id: gpt-4o-mini\nblocks: []\n"}'
```

**Multipart example**:
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -F "file=@./example.yaml"
```

**Success response**:
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

**Possible errors**:
- 400 `{"error":"No YAML provided","hint":"Upload as form-data 'file' or JSON body {yaml: '...'}"}`
- 400 `{"error":"invalid_yaml","message":"..."}`

#### 4) POST `/api/export` — Export YAML from state

**Request body**:
```json
{
  "state": {
    "models": [ { "id": "gpt-4o-mini" } ],
    "blocks": [],
    "connections": []
  }
}
```

**Example**:
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

**Success response**:
```json
{
  "ok": true,
  "yaml": "mabel:\n  version: 1.0\nmodels:\n- id: gpt-4o-mini\nblocks: []\n"
}
```

**Possible errors**:
- 400 `{"error":"expected_json"}`
- 400 `{"error":"invalid_state","message":"..."}`

#### 5) GET `/api/models` — Static curated model list for UI

```bash
curl -s http://127.0.0.1:8024/api/models
```

**Default list includes**:
- `gpt-4o-mini`, `gpt-4o`, `claude-3.5-sonnet`, `gemini-1.5-pro`, `llama-3.1-70b`

Customize in `sdg_app/api.py` within `api_models()`.

### YAML Normalization Rules

Implemented in `sdg_app/services_yaml_io.py`:

- Inputs are parsed with `yaml.safe_load`
- `models` may be:
  - a list of strings ⇒ converted to `{"id": "<str>"}` objects
  - a list of dicts ⇒ `id` inferred from `id` | `name` | `api_model` if present
- If `models` is absent/empty, unique models are derived from `blocks[*].model`
- Output always includes `mabel.version = "1.0"`
- `connections` are preserved only when non-empty
- Dumped YAML uses `safe_dump(sort_keys=False, allow_unicode=True)`

### Validation and Schemas

Defined in `sdg_app/schemas.py` (Pydantic v2):

- `ModelDef`: `{ id: str, provider?: str, label?: str, meta?: object }`
- `Block` (allows extra fields):
  - `{ type: string, exec?: number|null (default 1), model?: string, name?: string, prompt?: string, params?: object, extra?: object }`
- `GraphState`: `{ models: ModelDef[], blocks: Block[], connections: object[] }`
- `ImportRequest`: `{ yaml?: string }`
- `ExportRequest`: `{ state: GraphState }`

On `/api/import`, the normalized state is validated with `GraphState`.  
On `/api/export`, input is validated with `ExportRequest`.

### Error Handling

Centralized JSON error responses (`sdg_app/errors.py`):
- 400: `{"error":"bad_request","message":"..."}` (generic)
- 413: `{"error":"payload_too_large","message":"Upload is too large."}`
- 404: `{"error":"not_found","message":"Resource not found."}`
- 500: `{"error":"server_error","message":"Unexpected error."}` (also logs with stack trace)

## Security

`sdg_app/security.py` attaches basic hardening headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy` relaxed to allow inline scripts/styles for UI compatibility

If you add external resources, adjust CSP accordingly.

## Frontend Architecture

### No Build Step
- All assets are static files under `sdg_app/static`
- Main HTML is `sdg_app/templates/index.html`
- Modular JavaScript with clear separation of concerns

### UI Modules
- **app.core.js**: State management, utilities, constants
- **app.graph.js**: Graph logic, wiring detection, topological sorting
- **app.yaml.js**: YAML import/export, serialization
- **app.ui.models.js**: Model configuration panel
- **app.ui.nodes.js**: Node rendering, drag & drop, canvas interactions
- **app.ui.editor.js**: Block editor forms (AI/LOGIC/CODE/END/START)
- **app.ui.v2settings.js**: MABEL v2 settings modal
- **app.ui.init.js**: Initialization and event wiring

### Visual Design
- **Theme**: Frutiger Aero inspired (light, airy, translucent)
- **Glassmorphism**: Panels with backdrop blur and subtle borders
- **Color scheme**: Soft gradients (cyan to lime for wires, pastel UI elements)
- **Typography**: System fonts with clear hierarchy

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
