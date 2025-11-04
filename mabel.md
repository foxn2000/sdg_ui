# <a name="header"></a><a name="content"></a><a name="mabelスタジオが生成するaiエージェント用yamlファイル仕様"></a>MABELスタジオが生成するAIエージェント用YAMLファイル仕様
このドキュメントでは、付属のフロントエンド（MABEL Studio v1.1）が生成・取り込むYAMLフォーマットについて、初心者向けに詳しく解説します。MABEL StudioはAIモデルの呼び出しやロジック・コードブロックを視覚的に組み合わせ、エージェントの処理フローをYAMLファイルとして出力します。以下ではYAMLの全体構造、各セクションの役割、ブロックごとの記述項目、および書き方の注意点をまとめます。
## <a name="yaml全体構造"></a>YAML全体構造
YAMLは階層構造でデータを表す軽量な記述形式です。MABEL StudioのYAMLは大きく以下の要素から構成されます。

|セクション|説明|
| :- | :- |
|mabel|ファイルのバージョンを示すヘッダー。{ version: "1.0" } の形で記述します。バージョン1.0ではオプションですが、将来の互換性のために入れておくことが推奨されます。|
|models|使用するAIモデルの一覧。各モデルは辞書形式で定義します。|
|blocks|エージェントの処理ステップを表すブロック群。ai・logic・python・end の4種があり、実行順序(exec)を付けて並べます。|
|connections|ブロック間の明示的な配線を記述するオプションの一覧。MABEL Studio v1.1では名前一致で自動配線されるため通常は不要ですが、外部ツールで利用する場合は from, to などを指定して出力/入力をつなげることができます。|
### <a name="yamlの基本記法"></a>YAMLの基本記法
- **インデントは半角スペースで統一**します。各階層ごとに2スペースが推奨です。タブは使用できません。
- **リスト**はハイフン(-)で始めます。リストの各要素は同じインデント幅で並べます。
- **オブジェクト(辞書)**は キー: 値 で記述します。値が複数行に渡る場合は後述のリテラル表記を用います。
- 特殊文字やスペースを含む文字列は二重引用符("…")または単一引用符('…')で囲います。MABEL Studioでは内部的にJSON形式のエスケープを用いているため、 や " のようなエスケープも利用できます。
- 空行は無視されますが、適宜挿入すると読みやすくなります。
## <a name="models-セクション"></a>models セクション
models はAIモデルに関する設定をまとめるリストです。各要素で以下のようなフィールドを指定します。

|フィールド|必須|型/説明|
| :- | :- | :- |
|name|○|フロントエンドで識別するモデル名です。ブロックからはこの名前で参照します。|
|api\_model|○|実際に呼び出すAPI上のモデル名（例: gpt-4o-mini）。|
|api\_key|○|モデル呼び出しに使用するAPIキー。環境変数記法 ${ENV.OPENAI\_API\_KEY} を用いることもできます。|
|base\_url|任意|APIエンドポイントのURL。OpenAI以外のプロバイダーに接続する際に指定します。|
|organization|任意|OpenAI組織IDなど、プロバイダー固有の組織識別子。|
|headers|任意|追加HTTPヘッダーをオブジェクト形式で指定します（例: {"User-Agent":"Mabel"}）。|
|request\_defaults|任意|モデル呼び出し時のデフォルトパラメータ。下位に temperature, top\_p, max\_tokens, timeout\_sec, retry などを指定します。retry は max\_attempts と backoff から成るオブジェクトで、リトライ回数やバックオフ戦略を設定できます。|

特定プロバイダー向けの別仕様では id, provider, label, meta を持つ形式もあります。これは mabel 仕様1.0で採用されているもので、モデルIDとプロバイダー名を明確に分けたい場合に使います。MABEL Studioでは name/api\_model 形式で記述するのが標準です。
### <a name="モデル定義の例"></a>モデル定義の例
mabel:\
`  `version: "1.0"\
models:\
`  `- name: planner\
`    `api\_model: gpt-4o-mini\
`    `api\_key: ${ENV.OPENAI\_API\_KEY}\
`    `base\_url: https://api.openai.com/v1\
`    `request\_defaults:\
`      `temperature: 0.0\
`      `max\_tokens: 800\
`  `- name: writer\
`    `api\_model: gpt-4.1\
`    `api\_key: ${ENV.OPENAI\_API\_KEY}\
`    `request\_defaults:\
`      `temperature: 0.3\
`      `top\_p: 0.95\
`      `max\_tokens: 1200
## <a name="blocks-セクション"></a>blocks セクション
blocks は処理フローを構成するステップをリスト形式で記述します。各ブロックには共通して以下のプロパティがあります。

|フィールド|必須|説明|
| :- | :- | :- |
|type|○|ブロックの種類。ai・logic・python・end のいずれかを指定します。|
|exec|○|実行順序を示す整数。MABEL Studioではブロック間の依存関係から自動計算されますが、手動で設定することもできます。|
|run\_if|任意|ブロックの実行条件をJSONオブジェクトで指定します。条件が真と評価された場合にのみブロックが実行されます。|
|on\_error|任意|エラー発生時の動作。fail (デフォルト) か continue を指定します。|

以下ではブロックタイプごとに追加で使えるプロパティを説明します。
### <a name="ai-ブロック"></a>1. ai ブロック
AIモデルにプロンプトを送信し応答を得るブロックです。models セクションで定義した name を参照します。

|フィールド|必須|型/説明|
| :- | :- | :- |
|model|○|利用するモデル名。|
|system\_prompt|任意|モデルに与えるシステムプロンプト。複数行の場合は | を用いて行インデント付きで記述します。|
|prompts|○|ユーザー向けプロンプトのリスト。各要素を - で並べます。複数行にしたい場合は | を使います。|
|outputs|○|応答から抽出する出力定義のリスト。各要素の詳細は下表参照。|
|params|任意|モデル呼び出し時に上書きしたいパラメータ。temperature, top\_p, max\_tokens, timeout\_sec などを指定します。stop は終了トークン列のリストとして [...] 形式で指定します。|
#### <a name="outputs-定義"></a>*outputs 定義*

|フィールド|必須|説明|
| :- | :- | :- |
|name|○|出力名。後続のブロックではこの名前で参照します。|
|select|○|抽出方法。full(応答全体)、tag(特定のHTMLタグ)、regex(正規表現) のいずれかを指定します。|
|tag|select: tag の場合|抽出対象のタグ名。|
|regex|select: regex の場合|応答から値を取り出す正規表現パターン。|
|join\_with|任意|複数の値を連結する際の区切り文字。|
### <a name="logic-ブロック"></a>2. logic ブロック
AI出力に対する分岐や集合処理、反復処理を記述するブロックです。op に応じて利用可能なパラメータが変わります。
#### <a name="共通フィールド"></a>*共通フィールド*

|フィールド|必須|説明|
| :- | :- | :- |
|name|任意|ブロックに任意のラベルを付けるための名前。|
|op|○|実行する操作を示します。if・and・or・not・for から選択します。|
#### <a name="op-if-条件分岐"></a>*op: if (条件分岐)*

|フィールド|必須|説明|
| :- | :- | :- |
|cond|○|条件式を表すJSONオブジェクト。例えば {"equals":["{Flag}","on"]} のように書きます。|
|then|任意|条件が真の場合に返す値。出力名や文字列を指定します。|
|else|任意|条件が偽の場合に返す値。|
#### <a name="op-andornot-論理演算"></a>*op: and/or/not (論理演算)*

|フィールド|必須|説明|
| :- | :- | :- |
|operands|○|判定対象の式を配列(JSON)で指定します。not の場合は1要素のみを持つ配列にします。|
#### <a name="op-for-反復処理"></a>*op: for (反復処理)*
このモードではリストや文字列を分割・変換しながらループ処理を行います。

|フィールド|必須|説明|
| :- | :- | :- |
|list|○|反復対象となる変数や文字列。AIブロックの出力名を使う場合は {OutputName} の形式で記述します。|
|parse|任意|入力の解析方法。指定しない場合は行単位(lines)。csv, json, regex のいずれかを指定できます。|
|regex\_pattern|parse: regex の場合|入力を分割する正規表現。|
|var|任意|ループ内で要素を格納する変数名。省略時は item になります。|
|drop\_empty|任意|空要素を無視するかどうか。true または false。|
|where|任意|フィルタ条件をJSONで指定します。条件が真の要素だけが残ります。|
|map|任意|各要素を変換するテンプレート文字列。例えば {item.title} のように書くと出力がそのプロパティに変換されます。|
#### <a name="logic-ブロックの-outputs"></a>*logic ブロックの outputs*
反復や条件の結果を出力として取り出すために outputs を定義できます。

|フィールド|必須|説明|
| :- | :- | :- |
|name|○|出力名。|
|from|○|どの値を出力するかを表すモード。boolean（真偽値）、value（最後に評価した値）、join（リスト要素を連結）、count（要素数）、any/all（論理判定）、first/last（最初または最後の要素）、list（リスト全体）から選択します。|
|source|任意|出力元。raw（入力リスト）、filtered（条件適用後）、mapped（マッピング後）のいずれかを指定します。|
|join\_with|任意|from: join のときに要素を連結する区切り文字。|
|test|任意|条件式(JSON)。any/all 判定などで利用します。|
|limit/offset|任意|先頭から offset 件を飛ばし、最大 limit 件を取得する制限。|
### <a name="python-ブロック"></a>3. python ブロック
Pythonコードや関数を呼び出すブロックです。外部スクリプトを連携させる際に使用します。

|フィールド|必須|説明|
| :- | :- | :- |
|name|○|ブロック名。エディタ上では py\_name と呼ばれます。|
|function|○|呼び出すPython関数の名前。通常はモジュール内の関数名です。|
|inputs|任意|関数に渡す入力名のリスト。AIブロックやLogicブロックの出力名を指定します。[Answer, Plan] のように角括弧で包んだ形式になります。|
|code\_path|任意|実行するPythonコードファイルへのパス。デフォルトは ./script.py。|
|venv\_path|任意|使用する仮想環境のパス。デフォルトは ./.venv。|
|outputs|○|関数が返す出力名をリストで指定します。|
|run\_if/on\_error|任意|他のブロックと同様。|
### <a name="end-ブロック"></a>4. end ブロック
フローを終了し最終的なレスポンスをまとめるためのブロックです。end は1つだけ配置するのが一般的です。

|フィールド|必須|説明|
| :- | :- | :- |
|reason|任意|終了理由のメッセージ。|
|exit\_code|任意|終了コード。成功なら success、失敗なら error など文字列で記述できます。|
|final|任意|出力ペイロードとして返す変数のリスト。各要素は name と value を持ちます。例えば Answer や Plan のようなAI/Logic/Pythonブロックの出力名を割り当てます。|
|run\_if/on\_error|任意|他のブロックと同様。|
## <a name="connections-セクション-任意"></a>connections セクション (任意)
MABEL Studio v1.1では出力名と同名の入力を自動で検出し配線するため、通常は connections を書く必要はありません。ただし、別ツールや将来の仕様では明示的な接続指定をサポートしています。その場合、次のような形式で接続を定義します。

connections:\
`  `- from: block\_id\_1\
`    `output: Answer\
`    `to: block\_id\_2\
`    `input: Plan\
`  `- from: block\_id\_2\
`    `output: Plan\
`    `to: block\_id\_3\
`    `input: response

各ブロックには id フィールドを持たせることで、from/to で参照できるようにします。output/input はブロック内で定義した出力名・入力名を指します。MABEL StudioのUIには id フィールドは表示されませんが、エクスポートされたYAMLに手動で追加することもできます。
## <a name="書き方のポイントと注意事項"></a>書き方のポイントと注意事項
1. **インデントを厳密に守る**: YAMLはインデントによって階層を表します。特に blocks 内の各ブロックや outputs の入れ子を間違えないよう注意してください。
1. **JSONオブジェクトは引用符で囲む**: run\_if、cond、where などに記述する条件式はJSON形式の文字列として扱われます。{"equals":["{Flag}","on"]} のようにダブルクォートで囲い、内部の引用符はバックスラッシュでエスケープします。
1. **複数行文字列の記述**: system\_prompt や長いプロンプトは | を使って複数行リテラルにします。行頭のインデントは2スペースを基準に揃えます。
1. **出力名・入力名の統一**: ブロック間のデータの受け渡しは名前でマッチングします。ai ブロックの outputs で定義した名前を、後続の logic や python ブロックの入力 (list や inputs) で正確に参照してください。誤字があると自動配線されません。
1. **パラメータの省略**: params や request\_defaults に値を指定しない場合はキーごと省略できます。空のオブジェクトや空文字列は出力されません。
1. **エラー処理**: on\_error: fail (デフォルト) はブロックでエラーが発生した場合に処理全体を停止します。continue を指定するとエラーを無視して次のブロックへ進みます。用途に応じて使い分けてください。
1. **エージェントの終了**: 最終出力を返すためには end ブロックを配置し、final に返したい変数を列挙します。reason や exit\_code を指定すると終了理由がログに残りやすくなります。
1. **拡張性**: mabel フィールドを更新することで将来の仕様変更に備えることができます。追加プロパティは extra としてブロックごとにネストすることも可能ですが、互換性には注意してください。
## <a name="サンプルエージェントyaml"></a>サンプルエージェントYAML
以下は、2つのAIブロック（質問生成と回答生成）、ロジックブロックによる条件分岐、Pythonブロックによるデータ整形、そして最終的な出力を返す end ブロックから成る例です。

mabel:\
`  `version: "1.0"\
\
models:\
`  `- name: questioner\
`    `api\_model: gpt-4o-mini\
`    `api\_key: ${ENV.OPENAI\_API\_KEY}\
`    `request\_defaults:\
`      `temperature: 0.2\
`      `max\_tokens: 300\
`  `- name: responder\
`    `api\_model: gpt-4.1\
`    `api\_key: ${ENV.OPENAI\_API\_KEY}\
`    `request\_defaults:\
`      `temperature: 0.5\
`      `max\_tokens: 800\
\
blocks:\
`  `- type: ai\
`    `exec: 1\
`    `model: questioner\
`    `system\_prompt: |\
`      `You are a helpful assistant who formulates concise questions.\
`    `prompts:\
`      `- | \
`          `Summarize the key question from the following input:\
`          `{UserInput}\
`    `outputs:\
`      `- name: Question\
`        `select: full\
`    `params:\
`      `temperature: 0.1\
\
`  `- type: ai\
`    `exec: 2\
`    `model: responder\
`    `system\_prompt: |\
`      `You answer questions clearly and accurately.\
`    `prompts:\
`      `- | \
`          `Provide a detailed answer to the following question:\
`          `{Question}\
`    `outputs:\
`      `- name: Answer\
`        `select: full\
`      `- name: ShortAnswer\
`        `select: regex\
`        `regex: '(?s)^(.+?)\\n'  # 最初の行のみ\
\
`  `- type: logic\
`    `exec: 3\
`    `name: CheckAnswer\
`    `op: if\
`    `cond: {"equals": ["{ShortAnswer}", ""]}\
`    `then: "No short answer generated."\
`    `else: "Short answer available."\
`    `outputs:\
`      `- name: Flag\
`        `from: boolean\
\
`  `- type: python\
`    `exec: 4\
`    `name: format\_result\
`    `function: format\_output\
`    `inputs: [Answer, Flag]\
`    `code\_path: ./helpers.py\
`    `venv\_path: ./.venv\
`    `outputs: [Formatted]\
\
`  `- type: end\
`    `exec: 5\
`    `final:\
`      `- name: answer\
`        `value: "{Formatted}"\
`      `- name: status\
`        `value: "{Flag}"

この例では、AIブロック同士のデータ受け渡しに出力名を用いています。logic ブロックで条件判定を行い、python ブロックで出力を整形してから end ブロックで最終レスポンスを返しています。
## <a name="まとめ"></a>まとめ
MABEL Studioが生成するYAMLは、エージェントの処理フローを人間にも読みやすい形式で表現するためのものです。models で使用するAIモデルを定義し、blocks で実行ステップを順番に記述します。各ブロックはタイプごとに固有の設定項目を持ち、outputs によってデータの流れが決まります。条件分岐や反復処理、カスタムPythonコード呼び出しがサポートされており、複雑なエージェントロジックもYAMLだけで記述可能です。

YAMLを書く際はインデントや引用符の扱いに注意し、出力名・入力名の整合性を保つことが大切です。本ドキュメントを参照しながら、自身のエージェントに適したYAMLを設計してください。

-----