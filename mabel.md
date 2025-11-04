# MABELスタジオが生成するAIエージェント用YAMLファイル仕様

このドキュメントでは、付属のフロントエンド（MABEL Studio v1.1）が生成・取り込むYAMLフォーマットについて、初心者向けに詳しく解説します。MABEL StudioはAIモデルの呼び出しやロジック・コードブロックを視覚的に組み合わせ、エージェントの処理フローをYAMLファイルとして出力します。以下ではYAMLの全体構造、各セクションの役割、ブロックごとの記述項目、および書き方の注意点をまとめます。

---

## YAML全体構造

YAMLは階層構造でデータを表す軽量な記述形式です。MABEL StudioのYAMLは大きく以下の要素から構成されます。

| セクション     | 説明 |
|------------|------|
| `mabel`    | ファイルのバージョンを示すヘッダー。`{ version: "1.0" }` の形で記述します。バージョン1.0ではオプションですが、将来の互換性のために入れておくことが推奨されます。 |
| `models`   | 使用するAIモデルの一覧。各モデルは辞書形式で定義します。 |
| `blocks`   | エージェントの処理ステップを表すブロック群。`ai`・`logic`・`python`・`end` の4種があり、実行順序(exec)を付けて並べます。 |
| `connections` | ブロック間の明示的な配線を記述するオプションの一覧。通常は不要ですが、外部ツールで利用する場合に使います。 |

---

## YAMLの基本記法

- インデントは**半角スペース（2スペース推奨）**で統一
- **リストはハイフン(-)** で記述
- **オブジェクトは `キー: 値`** 形式
- 特殊文字やスペースを含む文字列は **"…" または '…'** で囲む
- 空行は無視されるが、可読性のため適宜挿入

---

## models セクション

AIモデルに関する設定をまとめるリストで、以下のフィールドを持ちます：

| フィールド       | 必須 | 型/説明 |
|------------------|------|---------|
| name             | ○    | モデル名。ブロックから参照される識別子 |
| api_model        | ○    | 実際に呼び出すAPI上のモデル名（例: `gpt-4o-mini`） |
| api_key          | ○    | APIキー。`${ENV.OPENAI_API_KEY}` など環境変数記法可 |
| base_url         | 任意 | APIのエンドポイントURL |
| organization     | 任意 | OpenAI組織IDなど |
| headers          | 任意 | 追加HTTPヘッダー |
| request_defaults | 任意 | temperature, top_p, max_tokens, timeout_sec, retry などのデフォルト値を設定可能 |

---

## blocks セクション

処理フローを構成する主要セクションであり、以下のブロック種別があります：

### 共通フィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| type      | ○    | `ai`・`logic`・`python`・`end` のいずれか |
| exec      | ○    | 実行順序 |
| run_if    | 任意 | 実行条件（JSON形式） |
| on_error  | 任意 | エラー発生時の挙動：`fail` (デフォルト) または `continue` |

---

### 1. ai ブロック

AIモデルを呼び出すためのブロック。

| フィールド        | 必須 | 説明 |
|-------------------|------|------|
| model             | ○    | 利用するモデル名（modelsセクションで定義） |
| system_prompt     | 任意 | システムプロンプト。複数行は `|` 使用 |
| prompts           | ○    | ユーザー入力プロンプトのリスト |
| outputs           | ○    | 出力の定義リスト（後述） |
| params            | 任意 | 上書きパラメータ（温度等） |

**outputs 定義フィールド：**

| フィールド | 必須 | 説明 |
|-----------|------|------|
| name      | ○    | 出力名 |
| select    | ○    | `full`, `tag`, `regex` のいずれか |
| tag       | 条件 | select: tag の場合のタグ名 |
| regex     | 条件 | select: regex の場合の正規表現 |
| join_with | 任意 | 複数出力の連結文字列 |

---

### 2. logic ブロック

分岐や集合処理を行うブロック。

#### op: if（条件分岐）

| フィールド | 必須 | 説明 |
|-----------|------|------|
| cond      | ○    | 条件（JSON） |
| then      | 任意 | 条件が真の場合の返値 |
| else      | 任意 | 偽の場合の返値 |

#### op: and/or/not（論理演算）

| フィールド | 必須 | 説明 |
|-----------|------|------|
| operands  | ○    | 式の配列。`not` は1要素限定 |

#### op: for（反復）

| フィールド     | 必須 | 説明 |
|----------------|------|------|
| list           | ○    | 対象リストまたは文字列 |
| parse          | 任意 | `lines`, `csv`, `json`, `regex` |
| regex_pattern  | 条件 | parse: regex の場合の正規表現 |
| var            | 任意 | ループ内変数名（デフォルト: item） |
| drop_empty     | 任意 | 空要素を無視するか |
| where          | 任意 | フィルター条件 |
| map            | 任意 | 変換テンプレート（例: `{item.title}`） |

**logicブロックの outputs：**

| フィールド  | 必須 | 説明 |
|-------------|------|------|
| name        | ○    | 出力名 |
| from        | ○    | 出力モード（boolean, value, join, count, any/all, listなど） |
| source      | 任意 | raw, filtered, mapped のいずれか |
| join_with   | 任意 | 連結時の文字列 |
| test        | 任意 | 条件式（any/all） |
| limit/offset| 任意 | 出力制限 |

---

### 3. python ブロック

外部Pythonコードや関数の呼び出し用。

| フィールド    | 必須 | 説明 |
|---------------|------|------|
| name          | ○    | ブロック名 |
| function      | ○    | 関数名 |
| inputs        | 任意 | 入力名のリスト |
| code_path     | 任意 | スクリプトのパス（デフォルト `./script.py`） |
| venv_path     | 任意 | 仮想環境のパス（デフォルト `./.venv`） |
| outputs       | ○    | 出力名のリスト |

---

### 4. end ブロック

処理の終了と出力まとめ用。

| フィールド  | 必須 | 説明 |
|-------------|------|------|
| reason      | 任意 | 終了理由 |
| exit_code   | 任意 | 成功なら `success`、失敗なら `error` など |
| final       | 任意 | 出力名と変数の対応リスト |
| run_if等    | 任意 | 他ブロックと同様 |

---

## connections セクション（任意）

外部ツール連携や高度な制御が必要な場合のみ記述。

```yaml
connections:
  - from: block_id_1
    output: Answer
    to: block_id_2
    input: Plan
  - from: block_id_2
    output: Plan
    to: block_id_3
    input: response
```

---

## 書き方のポイントと注意事項

- インデントは厳守。特にネスト構造に注意
- `run_if` や `cond` などのJSONは **"…" で囲い内部は \ でエスケープ**
- 複数行は `|` とインデント
- 出力名・入力名の一致を保つ
- 空のパラメータは出力しない
- `on_error: continue` を使うと例外処理の柔軟性向上
- `end` ブロックでは `final` に返却変数を記述
- 将来対応のための `extra` や `mabel.version` 更新も可

---

## サンプル YAML

```yaml
mabel:
  version: "1.0"

models:
  - name: questioner
    api_model: gpt-4o-mini
    api_key: ${ENV.OPENAI_API_KEY}
    request_defaults:
      temperature: 0.2
      max_tokens: 300
  - name: responder
    api_model: gpt-4.1
    api_key: ${ENV.OPENAI_API_KEY}
    request_defaults:
      temperature: 0.5
      max_tokens: 800

blocks:
  - type: ai
    exec: 1
    model: questioner
    system_prompt: |
      You are a helpful assistant who formulates concise questions.
    prompts:
      - | 
          Summarize the key question from the following input:
          {UserInput}
    outputs:
      - name: Question
        select: full
    params:
      temperature: 0.1

  - type: ai
    exec: 2
    model: responder
    system_prompt: |
      You answer questions clearly and accurately.
    prompts:
      - | 
          Provide a detailed answer to the following question:
          {Question}
    outputs:
      - name: Answer
        select: full
      - name: ShortAnswer
        select: regex
        regex: '(?s)^(.+?)\\n'

  - type: logic
    exec: 3
    name: CheckAnswer
    op: if
    cond: {"equals": ["{ShortAnswer}", ""]}
    then: "No short answer generated."
    else: "Short answer available."
    outputs:
      - name: Flag
        from: boolean

  - type: python
    exec: 4
    name: format_result
    function: format_output
    inputs: [Answer, Flag]
    code_path: ./helpers.py
    venv_path: ./.venv
    outputs: [Formatted]

  - type: end
    exec: 5
    final:
      - name: answer
        value: "{Formatted}"
      - name: status
        value: "{Flag}"
```

---

## まとめ

- `models`: AIモデルの定義
- `blocks`: 処理ステップ（ai, logic, python, end）
- `connections`: 明示的な接続（通常不要）
- YAML記述時の**インデント・記法の正確さが最重要**

この仕様を活用して、柔軟かつ再利用性の高いAIエージェントの設計が可能です。
