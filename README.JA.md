# SDG Agent Interface（日本語）

Flask 3 を用いたモジュール構成の小規模 Web アプリケーションです。既存 UI（`templates/index.html` と `static/` 配下）をそのまま活かしつつ、バックエンドは読みやすさと堅牢性を重視して整理されています。YAML ベースのグラフ仕様（MABEL ライク）をインポート/エクスポートする簡易 REST API を提供します。

- Backend: Flask 3, Pydantic v2, PyYAML
- UI: `sdg_app/static` 配下の静的ファイルと `sdg_app/templates/index.html`
- API: YAML の Import/Export、モデル一覧、ヘルスチェック
- Security: ベーシックなセキュリティヘッダーとアップロードサイズ制限
- Tests: 最小限の API テスト（pytest）

英語版は README.md を参照してください。

## 特徴

- アプリケーションファクトリ（`create_app`）、Blueprint（`api_bp`）による明確な分離
- Pydantic v2（`schemas.py`）で入力検証
- YAML 入出力を `services_yaml_io.py` に集約（PyYAML）
- セキュリティヘッダー（CSP、X-Frame-Options など）と 4MB アップロード制限
- 最小限の API テスト（`tests/test_api.py`）
- 元の UI は保持しているため、安心して段階的に改善可能

## プロジェクト構成

```
.
├─ LICENSE
├─ README.md
├─ README.JA.md
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

## クイックスタート（conda 環境: sdg_ui）

前提:
- Conda（Anaconda もしくは Miniconda）
- 推奨 Python 3.11+

環境名 `sdg_ui` を作成・有効化し、依存関係をインストールして起動します。

```bash
# 1) 環境作成
conda create -n sdg_ui python=3.11 -y

# 2) 有効化
conda activate sdg_ui

# 3) 依存関係インストール
pip install -r requirements.txt

# 4) 開発サーバ起動
python wsgi.py
```

ブラウザで http://127.0.0.1:8024/ を開きます（開発時は 0.0.0.0:8024 でバインド）。

プロダクション例（Gunicorn）:

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8024 "wsgi:app"
```

## 設定

`sdg_app/settings.py` で定義される環境変数/設定:

- 環境変数
  - `SECRET_KEY` — セッション用シークレット（デフォルト: `dev-not-secret`）
  - `LOG_FILE` — ログ出力先（デフォルト: `sdg_app.log`）
- その他の設定
  - `MAX_CONTENT_LENGTH = 4 * 1024 * 1024`（4MB アップロード制限）
  - `JSON_AS_ASCII = False`
  - `TEMPLATES_AUTO_RELOAD = True`
- ログ
  - 非デバッグ/テスト時は `RotatingFileHandler` で `LOG_FILE` へローテーション出力

## セキュリティ

`sdg_app/security.py` でベーシックなヘッダーを付与します:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy`（既存 UI 互換のため inline を一部許可）

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

- 受け付け形式:
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

成功レスポンス例:
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

4) POST `/api/export` — 状態から YAML を生成して返却
- リクエストボディ例:
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

- 成功レスポンス例:
```json
{
  "ok": true,
  "yaml": "mabel:\n  version: 1.0\nmodels:\n- id: gpt-4o-mini\nblocks: []\n"
}
```

5) GET `/api/models` — UI 用の静的モデル一覧
```bash
curl -s http://127.0.0.1:8024/api/models
```

補足:
- Import 時は `models` が省略されていても、`blocks[*].model` から一意に導出します。
- Export は常に `mabel.version` を含み、`connections` は非空のときのみ出力します。

## バリデーションとスキーマ

Pydantic モデル（`sdg_app/schemas.py`）:
- `ModelDef`: `{ id: string, provider?: string, label?: string, meta?: object }`
- `Block`: `{ type: string, exec?: number, model?: string, name?: string, prompt?: string, params?: object, extra?: object }`
- `GraphState`: `{ models: ModelDef[], blocks: Block[], connections: object[] }`
- `ImportRequest`: `{ yaml?: string }`
- `ExportRequest`: `{ state: GraphState }`

`/api/import` では正規化後の状態を `GraphState` で検証し、`/api/export` では入力を `ExportRequest` で検証して YAML を返します。

## 開発メモ

- UI は `sdg_app/static` と `sdg_app/templates/index.html` にあり、既存ロジックを壊さないようにバックエンドを設計しています。
- MABEL 仕様を厳密にしたい場合は `sdg_app/services_yaml_io.py` を拡張して独自ルールを追加してください。
- モデル一覧は `sdg_app/api.py`（`api_models`）で調整できます。

## テスト

`requirements.txt` には `pytest` を含めていません。必要に応じてインストールして実行します。

```bash
conda activate sdg_ui
pip install pytest
pytest -q
```

## ライセンス

[LICENSE](./LICENSE) を参照してください。
