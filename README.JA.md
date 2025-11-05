# SDG Agent Interface（MABEL Studio）

Flask 3 ベースの AI エージェント用ビジュアル YAML ビルダーです。MABEL（Multi-Agent Building Engine Language）ワークフローを作成・管理するためのインタラクティブなノードベースエディタと、クリーンでモジュール化されたバックエンドアーキテクチャを提供します。

- **Backend**: Flask 3, Pydantic v2, PyYAML
- **Frontend**: パン/ズーム、自動レイアウト、ライブ配線機能を備えたビジュアルノードエディタ
- **API**: YAML の Import/Export、キュレートされたモデル一覧、ヘルスチェック
- **Security**: ベーシックなセキュリティヘッダーとアップロードサイズ制限
- **Tests**: 最小限の API テスト（pytest）

英語版は [README.md](./README.md) を参照してください。

## 特徴

### ビジュアルエディタ
- **ノードベースインターフェース**: AI、LOGIC、CODE、START、END ブロックをドラッグ&ドロップ
- **自動配線**: 入出力参照（例: `{変数名}`）に基づく自動接続検出
- **自動レイアウト**: 実行順序に基づいてブロックを垂直中央揃えで整列
- **パン & ズーム**: Space+ドラッグでのパン操作と Ctrl/⌘+ホイールでのズーム操作
- **キーボードショートカット**: ブロックの削除、位置調整、ズーム制御
- **ライブプレビュー**: リアルタイム YAML 生成とプレビュー

### ブロックタイプ
- **START**: `UserInput` 出力を持つエントリーポイント
- **AI**: モデル選択、システム/ユーザープロンプト、出力抽出機能を持つ LLM ベースのプロンプト
- **LOGIC**: 条件分岐（`if/and/or/not`）とループ（`for`）、フィルタリングとマッピング機能
- **CODE**: 入出力マッピングを持つ Python スクリプト実行
- **END**: 最終出力ペイロードを持つワークフロー終了

### MABEL v2 サポート
- **ランタイム設定**: タイムアウト、max_steps、トレース設定
- **予算管理**: モデル毎のトークン制限と総予算
- **グローバル変数**: ワークフロー全体で共有される変数
- **詳細設定**: リトライポリシー、エラーハンドリング、ログ出力

### モデル管理
- **複数 AI モデル**: OpenAI、Claude、Gemini、カスタムモデルの設定
- **リクエストデフォルト**: temperature、top_p、max_tokens、リトライ設定
- **保存/読込/リセット**: ブラウザベースのモデル設定永続化
- **YAML エクスポート**: モデル設定のみを個別にエクスポート

### バックエンドアーキテクチャ
- **クリーンアーキテクチャ**: アプリケーションファクトリ `create_app` と Blueprint `api_bp`
- **入力検証**: 型安全性のための Pydantic v2 スキーマ（`sdg_app/schemas.py`）
- **YAML 正規化**: モデル推論を含むインテリジェントなインポート/エクスポート（`sdg_app/services_yaml_io.py`）
- **セキュリティヘッダー**: CSP、X-Frame-Options などのハードニング対策
- **エラーハンドリング**: 適切なステータスコードを持つ一元化された JSON エラーレスポンス
- **ログ**: プロダクション環境向けのローテーティングファイルハンドラ

## プロジェクト構成

```
.
├─ LICENSE
├─ README.md
├─ README.JA.md
├─ requirements.txt
├─ wsgi.py
├─ sdg_app/
│  ├─ __init__.py                 # create_app ファクトリ、アプリケーション配線
│  ├─ api.py                      # ルート: UI, healthz, import/export, models
│  ├─ errors.py                   # JSON エラーハンドラ
│  ├─ schemas.py                  # Pydantic v2 モデル
│  ├─ security.py                 # セキュリティヘッダー（CSP 等）
│  ├─ services_yaml_io.py         # YAML ⇄ state の変換/正規化
│  ├─ settings.py                 # 設定（環境変数、制限、ログ）
│  ├─ static/
│  │  ├─ css/style.css            # Frutiger Aero テーマのスタイリング
│  │  └─ js/
│  │     ├─ app.core.js           # 状態管理とユーティリティ
│  │     ├─ app.graph.js          # グラフ/配線ロジック
│  │     ├─ app.js                # (レガシー/モノリシック、新モジュール参照)
│  │     ├─ app.ui.editor.js      # ブロックエディタフォーム
│  │     ├─ app.ui.init.js        # 初期化とイベントバインディング
│  │     ├─ app.ui.models.js      # モデルパネル UI
│  │     ├─ app.ui.nodes.js       # ノードレンダリングとキャンバス操作
│  │     ├─ app.ui.v2settings.js  # MABEL v2 設定モーダル
│  │     └─ app.yaml.js           # YAML インポート/エクスポートロジック
│  └─ templates/
│     └─ index.html
└─ tests/
   └─ test_api.py
```

## クイックスタート

前提条件:
- Conda（Anaconda / Miniconda）または Python venv
- 推奨: Python 3.11+

### Conda 例:

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

### 代替（venv + flask run）:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export FLASK_APP=wsgi:app
export FLASK_DEBUG=1
flask run --host=0.0.0.0 --port=8024
```

### プロダクション例（Gunicorn）:

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8024 "wsgi:app"
```

## 設定

`sdg_app/settings.py` に定義:

- **環境変数**
  - `SECRET_KEY` — セッション用シークレット（デフォルト: `dev-not-secret`）
  - `LOG_FILE` — ログファイルパス（デフォルト: `sdg_app.log`）
- **その他の設定**
  - `MAX_CONTENT_LENGTH = 4 * 1024 * 1024`（4MB アップロード制限）
  - `JSON_AS_ASCII = False`
  - `TEMPLATES_AUTO_RELOAD = True`
- **ログ**
  - デバッグ/テスト以外では `RotatingFileHandler` を使い `LOG_FILE` へローテーション出力（1MB、バックアップ 3 世代）

## 使い方

### ビジュアルエディタのワークフロー

1. **モデル設定**（右パネル上部）:
   - AI モデルを API キー、ベース URL、リクエストデフォルト値と共に追加
   - ブラウザストレージに設定を保存/読込
   - モデル設定を YAML としてエクスポート

2. **ワークフロー構築**（メインキャンバス）:
   - ライブラリ（右パネル下部）からキャンバスへブロックをドラッグ
   - ブロックをクリックしてプロパティ（プロンプト、条件、コード等）を編集
   - プロンプト/条件内の `{出力名}` プレースホルダーに基づき自動配線
   - **Auto Layout** で実行順序に基づいて整列
   - **ナビゲーション**:
     - パン: Space + ドラッグ、中ボタン、またはスクロールホイール
     - ズーム: Ctrl/⌘ + ホイール、またはズーム HUD（−/100%/+/Fit）を使用
     - 削除: ブロックを選択して Delete/Backspace キーを押す
     - 微調整: ブロックを選択して矢印キーを使用

3. **v2 設定**（オプション）:
   - ⚙️ ボタンをクリックして MABEL v2 設定を開く
   - ランタイム制限、予算、グローバル変数を設定

4. **エクスポート/インポート**:
   - **YAML Generate**: 完全なワークフローを YAML としてダウンロード
   - **YAML Preview**: ダウンロードせずに生成された YAML を表示
   - **YAML Import**: `.yaml`/`.yml` ファイルをアップロードまたはドラッグ&ドロップ
   - **Models YAML**: モデル設定のみをエクスポート

### キーボードショートカット

- **Delete/Backspace**: 選択したブロックを削除
- **矢印キー**: 選択したブロックを微調整（24px グリッドスナップ）
- **Ctrl/⌘ + +**: ズームイン
- **Ctrl/⌘ + -**: ズームアウト
- **Ctrl/⌘ + 0**: ズームを 100% にリセット
- **Space + ドラッグ**: キャンバスをパン
- **Enter**（ライブラリアイテム上で）: キャンバスにブロックを追加

## API

ベース URL: `/`

### エンドポイント:

#### 1) GET `/` — UI（index.html）を返却

#### 2) GET `/healthz` — ヘルスチェック
```bash
curl -s http://127.0.0.1:8024/healthz
# -> {"status":"ok"}
```

#### 3) POST `/api/import` — YAML を取り込み、正規化したグラフ状態を返却

**受け付け**:
- multipart/form-data（ファイルフィールド名: `file`）
- または JSON ボディ: `{"yaml":"...yaml text..."}`

**JSON 例**:
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -H "Content-Type: application/json" \
  -d '{"yaml":"mabel:\n  version: 1.0\nmodels:\n  - id: gpt-4o-mini\nblocks: []\n"}'
```

**multipart 例**:
```bash
curl -s -X POST http://127.0.0.1:8024/api/import \
  -F "file=@./example.yaml"
```

**成功レスポンス**:
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

**想定されるエラー例**:
- 400 `{"error":"No YAML provided","hint":"Upload as form-data 'file' or JSON body {yaml: '...'}"}`
- 400 `{"error":"invalid_yaml","message":"..."}`

#### 4) POST `/api/export` — 状態から YAML を生成して返却

**リクエストボディ**:
```json
{
  "state": {
    "models": [ { "id": "gpt-4o-mini" } ],
    "blocks": [],
    "connections": []
  }
}
```

**実行例**:
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

**成功レスポンス**:
```json
{
  "ok": true,
  "yaml": "mabel:\n  version: 1.0\nmodels:\n- id: gpt-4o-mini\nblocks: []\n"
}
```

**想定されるエラー例**:
- 400 `{"error":"expected_json"}`
- 400 `{"error":"invalid_state","message":"..."}`

#### 5) GET `/api/models` — UI 用の静的モデル一覧

```bash
curl -s http://127.0.0.1:8024/api/models
```

**既定の一覧には以下が含まれます**:
- `gpt-4o-mini`, `gpt-4o`, `claude-3.5-sonnet`, `gemini-1.5-pro`, `llama-3.1-70b`

変更する場合は `sdg_app/api.py` の `api_models()` を編集してください。

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

`/api/import` では正規化後の状態を `GraphState` で検証します。  
`/api/export` では入力を `ExportRequest` で検証します。

### エラーハンドリング

`sdg_app/errors.py` による JSON 形式の一元エラーレスポンス:
- 400: `{"error":"bad_request","message":"..."}`（汎用）
- 413: `{"error":"payload_too_large","message":"Upload is too large."}`
- 404: `{"error":"not_found","message":"Resource not found."}`
- 500: `{"error":"server_error","message":"Unexpected error."}`（スタックトレースもログ出力）

## セキュリティ

`sdg_app/security.py` でベーシックなヘッダーを付与します:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Content-Security-Policy` は UI 互換性のため inline scripts/styles を一部許可

外部リソースを追加する場合は CSP を調整してください。

## フロントエンドアーキテクチャ

### ビルド不要
- 全アセットは `sdg_app/static` 配下の静的ファイル
- メイン HTML は `sdg_app/templates/index.html`
- 関心の分離が明確なモジュール化された JavaScript

### UI モジュール
- **app.core.js**: 状態管理、ユーティリティ、定数
- **app.graph.js**: グラフロジック、配線検出、トポロジカルソート
- **app.yaml.js**: YAML インポート/エクスポート、シリアライゼーション
- **app.ui.models.js**: モデル設定パネル
- **app.ui.nodes.js**: ノードレンダリング、ドラッグ&ドロップ、キャンバス操作
- **app.ui.editor.js**: ブロックエディタフォーム（AI/LOGIC/CODE/END/START）
- **app.ui.v2settings.js**: MABEL v2 設定モーダル
- **app.ui.init.js**: 初期化とイベント配線

### ビジュアルデザイン
- **テーマ**: Frutiger Aero インスパイア（明るく、軽やか、半透明）
- **グラスモーフィズム**: バックドロップブラーと繊細なボーダーを持つパネル
- **カラースキーム**: ソフトグラデーション（配線はシアンからライムへ、パステル UI 要素）
- **タイポグラフィ**: 明確な階層を持つシステムフォント

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
