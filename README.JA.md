# SDG Agent Interface（日本語）

Flask 3 を用いたモジュール構成の小規模 Web アプリです。オリジナルの静的 UI を保持しつつ、バックエンドは明瞭性・検証・基本的ハードニングのためにリファクタリングされています。YAML ベースのグラフ仕様（MABEL ライク）をインポート/エクスポートする簡易 REST API を提供します。

- Backend: Flask 3, Pydantic v2, PyYAML
- UI: `sdg_app/static` 配下の静的ファイルと `sdg_app/templates/index.html`
- API: YAML の Import/Export、キュレートされたモデル一覧、ヘルスチェック
- Security: ベーシックなセキュリティヘッダーとアップロードサイズ制限
- Tests: 最小限の API テスト（pytest）

英語版は [README.md](./README.md) を参照してください。

## 特徴

- クリーンアーキテクチャ
  - アプリケーションファクトリ `create_app` と Blueprint `api_bp`
  - エラーハンドラとセキュリティヘッダーの集中管理
- Pydantic v2 による入力検証（`sdg_app/schemas.py`）
- YAML の正規化を含む Import/Export 実装（`sdg_app/services_yaml_io.py`、PyYAML）
- セキュリティヘッダー（CSP、X-Frame-Options など）、4MB アップロード制限
- 最小限のテスト（`tests/test_api.py`）
- ビルド不要の静的 UI（そのまま提供）

## プロジェクト構成

```
.
├─ LICENSE
├─ README.md
├─ README.JA.md
├─ requirements.txt
├─ wsgi.py
├─ sdg_app/
│  ├─ __init__.py                 # create_app の定義、各種の結線
│  ├─ api.py                      # ルート: UI, healthz, import/export, models
│  ├─ errors.py                   # JSON エラーハンドラ
│  ├─ schemas.py                  # Pydantic v2 モデル
│  ├─ security.py                 # セキュリティヘッダー（CSP 等）
│  ├─ services_yaml_io.py         # YAML ⇄ state の変換/正規化
│  ├─ settings.py                 # 設定（環境変数、制限、ログ）
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

## クイックスタート

前提:
- Conda（Anaconda / Miniconda）または Python venv
- 推奨: Python 3.11+

Conda 例:

```bash
# 1) 環境作成
conda create -n sdg_ui python=3.11 -y

# 2) 有効化
conda activate sdg_ui

# 3) 依存関係インストール
pip install -r requirements.txt

# 4) 開発サーバ起動（debug=True）
python wsgi.py
```

ブラウザで http://127.0.0.1:8024/ を開きます（開発時は 0.0.0.0:8024 でバインド）。

代替（venv + flask run）:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export FLASK_APP=wsgi:app
export FLASK_DEBUG=1
flask run --host=0.0.0.0 --port=8024
```

プロダクション例（Gunicorn）:

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8024 "wsgi:app"
```

## 設定

`sdg_app/settings.py` に定義:

- 環境変数
  - `SECRET_KEY` — セッション用シークレット（デフォルト: `dev-not-secret`）
  - `LOG_FILE` — ログファイルパス（デフォルト: `sdg_app.log`）
- その他の設定
  - `MAX_CONTENT_LENGTH = 4 * 1024 * 1024`（4MB アップロード制限）
  - `JSON_AS_ASCII = False`
  - `TEMPLATES_AUTO_RELOAD = True`
- ログ
  - デバッグ/テスト以外では `RotatingFileHandler` を使い `LOG_FILE` へローテーション出力（1MB、バックアップ 3 世代）

## セキュリティ

`sdg_app/security.py` でベーシックなヘッダーを付与します:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy` は既存 UI 互換のため inline scripts/styles を一部許可

外部リソースを追加する場合は CSP を調整してください。

## API

ベース URL: `/`

エンドポイント:

1) GET `/` — UI（index.html）を返却

2) GET `/healthz` — ヘルスチェック
```bash
curl -s http://127.0.0.1:8024/healthz
# -> {"status":"ok"}
```

3) POST `/api/import` — YAML を取り込み、正規化したグラフ状態を返却

- 受け付け:
  - multipart/form-data（ファイルフィールド名: `file`）
  - または JSON ボディ: `{"yaml":"...yaml text..."}`

JSON 例:
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -H "Content-Type: application/json" \
  -d '{"yaml":"mabel:\n  version: 1.0\nmodels:\n  - id: gpt-4o-mini\nblocks: []\n"}'
```

multipart 例:
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -F "file=@./example.yaml"
```

成功レスポンス:
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

想定されるエラー例:
- 400 `{"error":"No YAML provided","hint":"Upload as form-data 'file' or JSON body {yaml: '...'}"}`
- 400 `{"error":"invalid_yaml","message":"..."}`

4) POST `/api/export` — 状態から YAML を生成して返却
- リクエストボディ:
```json
{
  "state": {
    "models": [ { "id": "gpt-4o-mini" } ],
    "blocks": [],
    "connections": []
  }
}
```

- 実行例:
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

- 成功レスポンス:
```json
{
  "ok": true,
  "yaml": "mabel:\n  version: 1.0\nmodels:\n- id: gpt-4o-mini\nblocks: []\n"
}
```

想定されるエラー例:
- 400 `{"error":"expected_json"}`
- 400 `{"error":"invalid_state","message":"..."}`

5) GET `/api/models` — UI 用の静的モデル一覧
```bash
curl -s http://127.0.0.1:8024/api/models
```

- 既定の一覧には以下のような ID が含まれます:
  - `gpt-4o-mini`, `gpt-4o`, `claude-3.5-sonnet`, `gemini-1.5-pro`, `llama-3.1-70b`
- 変更する場合は `sdg_app/api.py` の `api_models()` を編集してください。

### YAML 正規化ルール

`sdg_app/services_yaml_io.py` に実装:

- 入力は `yaml.safe_load` でパース
- `models` の受け付け形式:
  - 文字列の配列 ⇒ `{"id": "<str>"}` の配列へ正規化
  - dict の配列 ⇒ `id` 不在時は `id` | `name` | `api_model` から推定
- `models` が省略/空の場合は `blocks[*].model` から一意に導出
- 出力 YAML は常に `mabel.version = "1.0"` を含む
- `connections` は非空のときのみ出力
- YAML 出力は `safe_dump(sort_keys=False, allow_unicode=True)` を使用

### バリデーションとスキーマ

`sdg_app/schemas.py`（Pydantic v2）に定義:

- `ModelDef`: `{ id: string, provider?: string, label?: string, meta?: object }`
- `Block`（追加フィールド許可）:
  - `{ type: string, exec?: number|null (default 1), model?: string, name?: string, prompt?: string, params?: object, extra?: object }`
- `GraphState`: `{ models: ModelDef[], blocks: Block[], connections: object[] }`
- `ImportRequest`: `{ yaml?: string }`
- `ExportRequest`: `{ state: GraphState }`

`/api/import` では正規化後の状態を `GraphState` で検証し、`/api/export` では入力を `ExportRequest` で検証します。

### エラーハンドリング

`sdg_app/errors.py` による JSON 形式の一元エラーレスポンス:
- 400: `{"error":"bad_request","message":"..."}`（汎用）
- 413: `{"error":"payload_too_large","message":"Upload is too large."}`
- 404: `{"error":"not_found","message":"Resource not found."}`
- 500: `{"error":"server_error","message":"Unexpected error."}`（スタックトレースもログ出力）

## フロントエンドメモ

- バンドラなし。全アセットは `sdg_app/static` 配下の静的ファイル。
- メイン HTML は `sdg_app/templates/index.html`。
- UI の簡易ヘルプ（アプリ内 Help 相当）:
  - キャンバスに AI / LOGIC / CODE / END をドラッグ
  - ノードをクリックして編集（任意項目は `<details>` 内）
  - Space+ドラッグでパン、Ctrl/⌘+ホイールでズーム
  - YAML は Generate/Preview/Import を使用

## テスト

`requirements.txt` に `pytest` は固定されていません。必要に応じてインストールして実行します。

```bash
pip install pytest
pytest -q
```

## 必要要件

```
Flask>=3.0.0,<3.1
PyYAML>=6.0.1,<7.0
pydantic>=2.8,<3.0
```

## ライセンス

[LICENSE](./LICENSE) を参照してください。
