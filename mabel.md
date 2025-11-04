# MABELスタジオが生成するAIエージェント用YAMLファイル仕様

このドキュメントでは、付属のフロントエンド（MABEL Studio v1.1）が生成・取り込むYAMLフォーマットについて、初心者向けに詳しく解説します。MABEL StudioはAIモデルの呼び出しやロジック・コードブロックを視覚的に組み合わせ、エージェントの処理フローをYAMLファイルとして出力します。以下ではYAMLの全体構造、各セクションの役割、ブロックごとの記述項目、および書き方の注意点をまとめます。

---

## YAML全体構造

YAMLは階層構造でデータを表す軽量な記述形式です。MABEL StudioのYAMLは大きく以下の要素から構成されます。

| セクション | 説明 |
|------------|------|
| **mabel** | ファイルのバージョンを示すヘッダー。`{ version: "1.0" }` の形で記述します。バージョン1.0ではオプションですが、将来の互換性のために入れておくことが推奨されます。 |
| **models** | 使用するAIモデルの一覧。各モデルは辞書形式で定義します。 |
| **blocks** | エージェントの処理ステップを表すブロック群。`ai`・`logic`・`python`・`end` の4種があり、実行順序(`exec`)を付けて並べます。 |
| **connections** | ブロック間の明示的な配線を記述するオプションの一覧。MABEL Studio v1.1では名前一致で自動配線されるため通常は不要ですが、外部ツールで利用する場合は `from`, `to` などを指定して出力/入力をつなげることができます。 |

---

## YAMLの基本記法

- インデントは**半角スペース2つ**で統一（タブは使用不可）
- リストはハイフン `-` で開始し、同じインデントで並べる
- オブジェクト（辞書）は `キー: 値` で記述
- 複数行の値はリテラル表記（`|`）を使用
- 特殊文字を含む文字列は引用符 `"..."` または `'...'` で囲む
- 空行は無視されるが、可読性向上のために適宜挿入可

---

## models セクション

`models` はAIモデルに関する設定をまとめるリストです。各要素で以下のフィールドを指定します。

| フィールド | 必須 | 型/説明 |
|------------|------|---------|
| name | ○ | フロントエンドで識別するモデル名。ブロックから参照します。 |
| api_model | ○ | 実際に呼び出すAPI上のモデル名（例: `gpt-4o-mini`）。 |
| api_key | ○ | モデル呼び出しに使用するAPIキー。`${ENV.OPENAI_API_KEY}` のように環境変数を参照可能。 |
| base_url | 任意 | APIエンドポイントのURL。OpenAI以外のプロバイダー接続時に指定。 |
| organization | 任意 | OpenAI組織IDなど。 |
| headers | 任意 | 追加HTTPヘッダー（例: `{"User-Agent":"Mabel"}`）。 |
| request_defaults | 任意 | モデル呼び出し時のデフォルトパラメータ。`temperature`, `top_p`, `max_tokens`, `timeout_sec`, `retry` など。 |

### モデル定義の例

```yaml
mabel:
  version: "1.0"
models:
  - name: planner
    api_model: gpt-4o-mini
    api_key: ${ENV.OPENAI_API_KEY}
    base_url: https://api.openai.com/v1
    request_defaults:
      temperature: 0.0
      max_tokens: 800
  - name: writer
    api_model: gpt-4.1
    api_key: ${ENV.OPENAI_API_KEY}
    request_defaults:
      temperature: 0.3
      top_p: 0.95
      max_tokens: 1200
````

---

## blocks セクション

`blocks` は処理フローを構成するステップをリスト形式で記述します。

| フィールド    | 必須 | 説明                                     |
| -------- | -- | -------------------------------------- |
| type     | ○  | ブロックの種類（`ai`・`logic`・`python`・`end`）。  |
| exec     | ○  | 実行順序を示す整数。                             |
| run_if   | 任意 | 実行条件。条件が真の場合にのみ実行。                     |
| on_error | 任意 | エラー発生時の動作。`fail`（デフォルト）または `continue`。 |

---

### 1. ai ブロック

AIモデルにプロンプトを送信し応答を得るブロックです。

| フィールド         | 必須 | 説明               |        |
| ------------- | -- | ---------------- | ------ |
| model         | ○  | 利用するモデル名。        |        |
| system_prompt | 任意 | システムプロンプト。複数行は ` | ` を使用。 |
| prompts       | ○  | ユーザー向けプロンプトのリスト。 |        |
| outputs       | ○  | 応答から抽出する出力定義リスト。 |        |
| params        | 任意 | 呼び出し時パラメータ上書き。   |        |

#### outputs 定義

| フィールド     | 必須  | 説明                          |
| --------- | --- | --------------------------- |
| name      | ○   | 出力名。                        |
| select    | ○   | 抽出方法（`full`・`tag`・`regex`）。 |
| tag       | 条件付 | `select: tag` の場合のタグ名。      |
| regex     | 条件付 | `select: regex` の場合の正規表現。   |
| join_with | 任意  | 連結時の区切り文字。                  |

---

### 2. logic ブロック

条件分岐や集合処理・反復処理を定義します。

#### 共通フィールド

| フィールド | 必須 | 説明                                 |
| ----- | -- | ---------------------------------- |
| name  | 任意 | 任意のラベル名。                           |
| op    | ○  | 操作種別（`if`・`and`・`or`・`not`・`for`）。 |

#### op: if（条件分岐）

| フィールド | 必須 | 説明             |
| ----- | -- | -------------- |
| cond  | ○  | 条件式JSONオブジェクト。 |
| then  | 任意 | 真のときの値。        |
| else  | 任意 | 偽のときの値。        |

#### op: and / or / not（論理演算）

| フィールド    | 必須 | 説明        |
| -------- | -- | --------- |
| operands | ○  | 判定対象の式配列。 |

#### op: for（反復処理）

| フィールド         | 必須  | 説明                                        |
| ------------- | --- | ----------------------------------------- |
| list          | ○   | 反復対象。                                     |
| parse         | 任意  | 入力の解析方法（`lines`, `csv`, `json`, `regex`）。 |
| regex_pattern | 条件付 | `parse: regex` の場合。                       |
| var           | 任意  | 要素変数名。                                    |
| drop_empty    | 任意  | 空要素を無視するか。                                |
| where         | 任意  | フィルタ条件(JSON)。                             |
| map           | 任意  | 各要素の変換テンプレート。                             |

#### logic ブロックの outputs

| フィールド        | 必須 | 説明                                                                           |
| ------------ | -- | ---------------------------------------------------------------------------- |
| name         | ○  | 出力名。                                                                         |
| from         | ○  | 出力モード（`boolean`, `value`, `join`, `count`, `any/all`, `first/last`, `list`）。 |
| source       | 任意 | 出力元（`raw`, `filtered`, `mapped`）。                                            |
| join_with    | 任意 | 区切り文字。                                                                       |
| test         | 任意 | 条件式。                                                                         |
| limit/offset | 任意 | 出力制限。                                                                        |

---

### 3. python ブロック

Pythonコードや関数を呼び出すブロックです。

| フィールド           | 必須 | 説明                              |
| --------------- | -- | ------------------------------- |
| name            | ○  | ブロック名。                          |
| function        | ○  | 呼び出すPython関数名。                  |
| inputs          | 任意 | 入力リスト。                          |
| code_path       | 任意 | 実行ファイルパス（デフォルト: `./script.py`）。 |
| venv_path       | 任意 | 仮想環境パス（デフォルト: `./.venv`）。       |
| outputs         | ○  | 関数の出力名リスト。                      |
| run_if/on_error | 任意 | 共通パラメータ。                        |

---

### 4. end ブロック

処理フローの終了と最終出力のまとめを行います。

| フィールド           | 必須 | 説明       |
| --------------- | -- | -------- |
| reason          | 任意 | 終了理由。    |
| exit_code       | 任意 | 終了コード。   |
| final           | 任意 | 出力変数リスト。 |
| run_if/on_error | 任意 | 共通パラメータ。 |

---

## connections セクション（任意）

通常は不要ですが、外部ツール連携時にブロック間の接続を明示できます。

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

* インデントを厳密に守る
* JSONオブジェクトは引用符で囲む
* 複数行文字列は `|` を使用
* 出力名・入力名を正確に一致させる
* 不要なキーは省略
* `on_error: continue` でエラーを無視可能
* `end` ブロックの `final` で出力変数を返す
* 拡張用プロパティは `extra` としてネスト可能

---

## サンプルエージェントYAML

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
        regex: '(?s)^(.+?)\\n'  # 最初の行のみ

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

MABEL Studioが生成するYAMLは、エージェントの処理フローを人間にも読みやすい形式で表現するためのものです。
`models` で使用するAIモデルを定義し、`blocks` で実行ステップを順番に記述します。
各ブロックはタイプごとに固有の設定項目を持ち、`outputs` によってデータの流れが決まります。
条件分岐・反復処理・Python連携が可能で、複雑なロジックもYAMLのみで構築できます。

YAMLを書く際はインデントや引用符の扱いに注意し、出力名・入力名の整合性を保つことが大切です。
本ドキュメントを参照しながら、自身のエージェントに適したYAMLを設計してください。

```

---

このMarkdownは、**内容・構成・語句を一切改変せず**、整形と視認性向上のためにMarkdown構文を適用したものです。
