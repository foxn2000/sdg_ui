// =========================
/* MABEL Studio Frontend (ui.v2settings: MABEL v2.1設定UI)
 * - runtime, budgets, globals, images, templates, files, functions, connectionsの編集
 * - v2.1: 画像入力機能追加
 */
// =========================

const v2SettingsModal = document.getElementById('v2SettingsModal');
const v2SettingsForm = document.getElementById('v2SettingsForm');
const v2SettingsBody = document.getElementById('v2SettingsBody');
const btnSaveV2Settings = document.getElementById('btnSaveV2Settings');

// v2設定モーダルを開く
function openV2Settings() {
  v2SettingsBody.innerHTML = buildV2SettingsForm();
  v2SettingsModal.showModal();
}

// v2設定フォームの構築
function buildV2SettingsForm() {
  const s = state;

  return `
    <div class="tabs-container">
      <div class="tabs-nav">
        <button type="button" class="tab-btn active" data-tab="meta">Metadata</button>
        <button type="button" class="tab-btn" data-tab="runtime">Runtime</button>
        <button type="button" class="tab-btn" data-tab="budgets">Budgets</button>
        <button type="button" class="tab-btn" data-tab="globals">Globals</button>
        <button type="button" class="tab-btn" data-tab="images">Images <span class="badge">v2.1</span></button>
        <button type="button" class="tab-btn" data-tab="templates">Templates</button>
        <button type="button" class="tab-btn" data-tab="files">Files</button>
        <button type="button" class="tab-btn" data-tab="functions">Functions</button>
        <button type="button" class="tab-btn" data-tab="connections">Connections</button>
      </div>
      <div class="tabs-content">
        <!-- Metadata -->
        <div class="tab-pane active" id="tab-meta">
          <div class="form-grid">
            <label>version</label>
            <input data-v2="mabel.version" value="${escapeAttr(s.mabel?.version || '2.1')}" readonly>
            <label>id</label>
            <input data-v2="mabel.id" value="${escapeAttr(s.mabel?.id || '')}" placeholder="com.example.agent.myagent">
            <label class="full">name</label>
            <input class="full" data-v2="mabel.name" value="${escapeAttr(s.mabel?.name || '')}" placeholder="My Agent">
            <label class="full">description</label>
            <textarea class="full" rows="2" data-v2="mabel.description" placeholder="エージェントの説明">${escapeHtml(s.mabel?.description || '')}</textarea>
          </div>
        </div>

        <!-- Runtime -->
        <div class="tab-pane" id="tab-runtime">
          <div class="form-grid">
            <div class="section-title full">Python設定</div>
            <label>interpreter</label>
            <input data-v2="runtime.python.interpreter" value="${escapeAttr(s.runtime?.python?.interpreter || '')}" placeholder="python>=3.11,<3.13">
            <label>venv</label>
            <input data-v2="runtime.python.venv" value="${escapeAttr(s.runtime?.python?.venv || '')}" placeholder=".venv">
            <label>requirements_file</label>
            <input class="full" data-v2="runtime.python.requirements_file" value="${escapeAttr(s.runtime?.python?.requirements_file || '')}" placeholder="requirements.txt">
            <label class="full">requirements（1行1パッケージ）</label>
            <textarea class="full" rows="3" data-v2="runtime.python.requirements" placeholder="numpy>=1.20.0\npandas>=1.3.0">${escapeHtml(Array.isArray(s.runtime?.python?.requirements) ? s.runtime.python.requirements.join('\n') : '')}</textarea>
            <label>allow_network</label>
            <select data-v2="runtime.python.allow_network">
              <option value="true" ${s.runtime?.python?.allow_network === true ? 'selected' : ''}>true</option>
              <option value="false" ${s.runtime?.python?.allow_network === false ? 'selected' : ''}>false</option>
              <option value="" ${s.runtime?.python?.allow_network === undefined ? 'selected' : ''}>(未設定)</option>
            </select>
            <label class="full">env（環境変数、1行1つ: KEY=value）</label>
            <textarea class="full" rows="3" data-v2="runtime.python.env" placeholder="DEBUG=true\nLOG_LEVEL=info">${escapeHtml(s.runtime?.python?.env ? Object.entries(s.runtime.python.env).map(([k, v]) => `${k}=${v}`).join('\n') : '')}</textarea>
          </div>
        </div>

        <!-- Budgets -->
        <div class="tab-pane" id="tab-budgets">
          <div class="form-grid">
            <div class="section-title full">Loops</div>
            <label>max_iters</label>
            <input type="number" data-v2="budgets.loops.max_iters" value="${s.budgets?.loops?.max_iters || ''}" placeholder="1000">
            <label>on_exceed</label>
            <select data-v2="budgets.loops.on_exceed">
              <option value="">(未設定)</option>
              <option value="error" ${s.budgets?.loops?.on_exceed === 'error' ? 'selected' : ''}>error</option>
              <option value="truncate" ${s.budgets?.loops?.on_exceed === 'truncate' ? 'selected' : ''}>truncate</option>
              <option value="warn" ${s.budgets?.loops?.on_exceed === 'warn' ? 'selected' : ''}>warn</option>
            </select>

            <div class="section-title full">Recursion</div>
            <label>max_depth</label>
            <input type="number" data-v2="budgets.recursion.max_depth" value="${s.budgets?.recursion?.max_depth || ''}" placeholder="64">
            <label>on_exceed</label>
            <select data-v2="budgets.recursion.on_exceed">
              <option value="">(未設定)</option>
              <option value="error" ${s.budgets?.recursion?.on_exceed === 'error' ? 'selected' : ''}>error</option>
              <option value="truncate" ${s.budgets?.recursion?.on_exceed === 'truncate' ? 'selected' : ''}>truncate</option>
              <option value="warn" ${s.budgets?.recursion?.on_exceed === 'warn' ? 'selected' : ''}>warn</option>
            </select>

            <div class="section-title full">Global</div>
            <label class="full">wall_time_ms（全体タイムアウト）</label>
            <input type="number" class="full" data-v2="budgets.wall_time_ms" value="${s.budgets?.wall_time_ms || ''}" placeholder="120000">

            <div class="section-title full">AI予算</div>
            <label>max_calls</label>
            <input type="number" data-v2="budgets.ai.max_calls" value="${s.budgets?.ai?.max_calls || ''}" placeholder="100">
            <label>max_tokens</label>
            <input type="number" data-v2="budgets.ai.max_tokens" value="${s.budgets?.ai?.max_tokens || ''}" placeholder="1000000">
          </div>
        </div>

        <!-- Globals -->
        <div class="tab-pane" id="tab-globals">
          <div class="form-grid">
            <label class="full">const（定数、1行1つ: KEY: value または KEY: {json}）</label>
            <textarea class="full" rows="4" data-v2="globals.const" placeholder="APP_NAME: My App\nVERSION: 1.0.0\nCONFIG: {debug: true}">${escapeHtml(s.globals?.const ? formatGlobalsForTextarea(s.globals.const) : '')}</textarea>
            
            <label class="full">vars（変数、1行1つ: KEY: value または KEY: {json}）</label>
            <textarea class="full" rows="4" data-v2="globals.vars" placeholder="counter: 0\nresult: []">${escapeHtml(s.globals?.vars ? formatGlobalsForTextarea(s.globals.vars) : '')}</textarea>
          </div>
        </div>

        <!-- Images -->
        <div class="tab-pane" id="tab-images">
          <div class="form-grid">
            <div class="small-note full">プロンプト内で <code>{name.img}</code> として参照できる静的画像を定義します。</div>
            <div class="full" id="imagesContainer">
              ${(s.images || []).map((img, i) => buildImageRow(img, i)).join('')}
            </div>
            <button type="button" class="accent full" id="btnAddImage">+ 画像追加</button>
          </div>
        </div>

        <!-- Templates -->
        <div class="tab-pane" id="tab-templates">
          <div class="form-grid">
            <div class="full" id="templatesContainer">
              ${(s.templates || []).map((t, i) => buildTemplateRow(t, i)).join('')}
            </div>
            <button type="button" class="accent full" id="btnAddTemplate">+ テンプレート追加</button>
          </div>
        </div>

        <!-- Files -->
        <div class="tab-pane" id="tab-files">
          <div class="form-grid">
            <div class="full" id="filesContainer">
              ${(s.files || []).map((f, i) => buildFileRow(f, i)).join('')}
            </div>
            <button type="button" class="accent full" id="btnAddFile">+ ファイル追加</button>
          </div>
        </div>

        <!-- Functions -->
        <div class="tab-pane" id="tab-functions">
          <div class="form-grid">
            <label class="full">Logic Functions（JSON配列）</label>
            <textarea class="full" rows="6" data-v2="functions.logic" placeholder='[{"name": "square", "args": ["x"], "returns": ["result"], "body": [...]}]'>${escapeHtml(s.functions?.logic ? JSON.stringify(s.functions.logic, null, 2) : '')}</textarea>
            
            <label class="full">Python Functions（JSON配列）</label>
            <textarea class="full" rows="6" data-v2="functions.python" placeholder='[{"name": "helper", "params": ["x"], "code": "def helper(x):\\n    return x * 2"}]'>${escapeHtml(s.functions?.python ? JSON.stringify(s.functions.python, null, 2) : '')}</textarea>
          </div>
        </div>

        <!-- Connections -->
        <div class="tab-pane" id="tab-connections">
          <div class="form-grid">
            <div class="small-note full">通常は自動配線されるため、明示的な指定は不要です。特殊な配線が必要な場合のみ使用してください。</div>
            <div class="full" id="connectionsContainer">
              ${(s.connections || []).map((c, i) => buildConnectionRow(c, i)).join('')}
            </div>
            <button type="button" class="accent full" id="btnAddConnection">+ 接続追加</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Globalsの値をテキストエリア用にフォーマット
function formatGlobalsForTextarea(obj) {
  return Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'object' && v !== null) {
      return `${k}: ${JSON.stringify(v)}`;
    }
    return `${k}: ${v}`;
  }).join('\n');
}

// テキストエリアからGlobalsをパース
function parseGlobalsFromTextarea(text) {
  const result = {};
  text.split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.substring(0, colonIdx).trim();
    const valueStr = line.substring(colonIdx + 1).trim();

    // JSONオブジェクトか配列の場合
    if ((valueStr.startsWith('{') && valueStr.endsWith('}')) ||
      (valueStr.startsWith('[') && valueStr.endsWith(']'))) {
      try {
        result[key] = JSON.parse(valueStr);
      } catch (e) {
        result[key] = valueStr;
      }
    } else {
      // 数値変換を試みる
      const num = Number(valueStr);
      result[key] = isNaN(num) ? valueStr : num;
    }
  });
  return result;
}

// 画像行の構築 (v2.1)
function buildImageRow(img, i) {
  return `
    <fieldset class="item-card form-grid">
      <legend>Image ${i + 1}</legend>
      <label>name（必須）</label>
      <input data-image-idx="${i}" data-image-k="name" value="${escapeAttr(img.name || '')}" placeholder="logo">
      <label>path（ローカルファイル）</label>
      <input class="full" data-image-idx="${i}" data-image-k="path" value="${escapeAttr(img.path || '')}" placeholder="./assets/logo.png">
      <label>url（Web画像）</label>
      <input class="full" data-image-idx="${i}" data-image-k="url" value="${escapeAttr(img.url || '')}" placeholder="https://example.com/image.png">
      <label>media_type</label>
      <select data-image-idx="${i}" data-image-k="media_type">
        <option value="image/png" ${img.media_type === 'image/png' ? 'selected' : ''}>image/png</option>
        <option value="image/jpeg" ${img.media_type === 'image/jpeg' ? 'selected' : ''}>image/jpeg</option>
        <option value="image/gif" ${img.media_type === 'image/gif' ? 'selected' : ''}>image/gif</option>
        <option value="image/webp" ${img.media_type === 'image/webp' ? 'selected' : ''}>image/webp</option>
      </select>
      <label class="full">base64（直接指定・長大なためオプション）</label>
      <textarea class="full" rows="2" data-image-idx="${i}" data-image-k="base64" placeholder="iVBORw0KGgoAAAANSUhEUg...">${escapeHtml(img.base64 || '')}</textarea>
      <button type="button" class="del full" data-act="delImage" data-image-idx="${i}">削除</button>
    </fieldset>
  `;
}

// テンプレート行の構築
function buildTemplateRow(t, i) {
  return `
    <fieldset class="item-card form-grid">
      <legend>Template ${i + 1}</legend>
      <label>name</label>
      <input data-template-idx="${i}" data-template-k="name" value="${escapeAttr(t.name || '')}" placeholder="header">
      <label class="full">text</label>
      <textarea class="full" rows="4" data-template-idx="${i}" data-template-k="text" placeholder="テンプレート内容\n{変数名}で置換">${escapeHtml(t.text || '')}</textarea>
      <button type="button" class="del full" data-act="delTemplate" data-template-idx="${i}">削除</button>
    </fieldset>
  `;
}

// ファイル行の構築
function buildFileRow(f, i) {
  return `
    <fieldset class="item-card form-grid">
      <legend>File ${i + 1}</legend>
      <label>name</label>
      <input data-file-idx="${i}" data-file-k="name" value="${escapeAttr(f.name || '')}" placeholder="data.txt">
      <label>mime</label>
      <input data-file-idx="${i}" data-file-k="mime" value="${escapeAttr(f.mime || '')}" placeholder="text/plain">
      <label class="full">content</label>
      <textarea class="full" rows="4" data-file-idx="${i}" data-file-k="content" placeholder="ファイル内容">${escapeHtml(f.content || '')}</textarea>
      <button type="button" class="del full" data-act="delFile" data-file-idx="${i}">削除</button>
    </fieldset>
  `;
}

// 接続行の構築
function buildConnectionRow(c, i) {
  return `
    <fieldset class="item-card form-grid">
      <legend>Connection ${i + 1}</legend>
      <label>from (block id)</label>
      <input data-conn-idx="${i}" data-conn-k="from" value="${escapeAttr(c.from || '')}" placeholder="block_id">
      <label>output</label>
      <input data-conn-idx="${i}" data-conn-k="output" value="${escapeAttr(c.output || '')}" placeholder="OutputName">
      <label>to (block id)</label>
      <input data-conn-idx="${i}" data-conn-k="to" value="${escapeAttr(c.to || '')}" placeholder="block_id">
      <label>input</label>
      <input data-conn-idx="${i}" data-conn-k="input" value="${escapeAttr(c.input || '')}" placeholder="InputName">
      <button type="button" class="del full" data-act="delConnection" data-conn-idx="${i}">削除</button>
    </fieldset>
  `;
}

// v2設定の保存
function saveV2Settings() {
  const s = state;

  // MABEL メタデータ
  if (!s.mabel) s.mabel = {};
  s.mabel.version = el('[data-v2="mabel.version"]', v2SettingsBody)?.value || '2.0';
  s.mabel.id = el('[data-v2="mabel.id"]', v2SettingsBody)?.value.trim() || undefined;
  s.mabel.name = el('[data-v2="mabel.name"]', v2SettingsBody)?.value.trim() || undefined;
  s.mabel.description = el('[data-v2="mabel.description"]', v2SettingsBody)?.value.trim() || undefined;

  // Runtime
  const interpreter = el('[data-v2="runtime.python.interpreter"]', v2SettingsBody)?.value.trim();
  const venv = el('[data-v2="runtime.python.venv"]', v2SettingsBody)?.value.trim();
  const reqFile = el('[data-v2="runtime.python.requirements_file"]', v2SettingsBody)?.value.trim();
  const reqText = el('[data-v2="runtime.python.requirements"]', v2SettingsBody)?.value.trim();
  const allowNet = el('[data-v2="runtime.python.allow_network"]', v2SettingsBody)?.value;
  const envText = el('[data-v2="runtime.python.env"]', v2SettingsBody)?.value.trim();

  if (interpreter || venv || reqFile || reqText || allowNet || envText) {
    if (!s.runtime) s.runtime = {};
    if (!s.runtime.python) s.runtime.python = {};

    if (interpreter) s.runtime.python.interpreter = interpreter;
    if (venv) s.runtime.python.venv = venv;
    if (reqFile) s.runtime.python.requirements_file = reqFile;
    if (reqText) {
      s.runtime.python.requirements = reqText.split('\n').map(l => l.trim()).filter(Boolean);
    }
    if (allowNet) s.runtime.python.allow_network = allowNet === 'true';
    if (envText) {
      const env = {};
      envText.split('\n').forEach(line => {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          env[line.substring(0, eqIdx).trim()] = line.substring(eqIdx + 1).trim();
        }
      });
      if (Object.keys(env).length > 0) s.runtime.python.env = env;
    }
  }

  // Budgets
  const loopsMax = el('[data-v2="budgets.loops.max_iters"]', v2SettingsBody)?.value.trim();
  const loopsExceed = el('[data-v2="budgets.loops.on_exceed"]', v2SettingsBody)?.value;
  const recMax = el('[data-v2="budgets.recursion.max_depth"]', v2SettingsBody)?.value.trim();
  const recExceed = el('[data-v2="budgets.recursion.on_exceed"]', v2SettingsBody)?.value;
  const wallTime = el('[data-v2="budgets.wall_time_ms"]', v2SettingsBody)?.value.trim();
  const aiMaxCalls = el('[data-v2="budgets.ai.max_calls"]', v2SettingsBody)?.value.trim();
  const aiMaxTokens = el('[data-v2="budgets.ai.max_tokens"]', v2SettingsBody)?.value.trim();

  if (loopsMax || loopsExceed || recMax || recExceed || wallTime || aiMaxCalls || aiMaxTokens) {
    if (!s.budgets) s.budgets = {};

    if (loopsMax || loopsExceed) {
      if (!s.budgets.loops) s.budgets.loops = {};
      if (loopsMax) s.budgets.loops.max_iters = Number(loopsMax);
      if (loopsExceed) s.budgets.loops.on_exceed = loopsExceed;
    }

    if (recMax || recExceed) {
      if (!s.budgets.recursion) s.budgets.recursion = {};
      if (recMax) s.budgets.recursion.max_depth = Number(recMax);
      if (recExceed) s.budgets.recursion.on_exceed = recExceed;
    }

    if (wallTime) s.budgets.wall_time_ms = Number(wallTime);

    if (aiMaxCalls || aiMaxTokens) {
      if (!s.budgets.ai) s.budgets.ai = {};
      if (aiMaxCalls) s.budgets.ai.max_calls = Number(aiMaxCalls);
      if (aiMaxTokens) s.budgets.ai.max_tokens = Number(aiMaxTokens);
    }
  }

  // Globals
  const constText = el('[data-v2="globals.const"]', v2SettingsBody)?.value.trim();
  const varsText = el('[data-v2="globals.vars"]', v2SettingsBody)?.value.trim();

  if (constText || varsText) {
    if (!s.globals) s.globals = {};
    if (constText) s.globals.const = parseGlobalsFromTextarea(constText);
    if (varsText) s.globals.vars = parseGlobalsFromTextarea(varsText);
  }

  // Images (v2.1)
  const images = [];
  els('[data-image-idx]', v2SettingsBody).forEach(inp => {
    const idx = parseInt(inp.dataset.imageIdx, 10);
    const k = inp.dataset.imageK;
    if (!images[idx]) images[idx] = {};
    images[idx][k] = inp.value;
  });
  s.images = images.filter(img => img.name).map(img => {
    // 空のフィールドは削除
    const cleaned = { name: img.name };
    if (img.path && img.path.trim()) cleaned.path = img.path.trim();
    if (img.url && img.url.trim()) cleaned.url = img.url.trim();
    if (img.base64 && img.base64.trim()) cleaned.base64 = img.base64.trim();
    if (img.media_type) cleaned.media_type = img.media_type;
    return cleaned;
  });

  // Templates
  const templates = [];
  els('[data-template-idx]', v2SettingsBody).forEach(inp => {
    const idx = inp.dataset.templateIdx;
    const k = inp.dataset.templateK;
    if (!templates[idx]) templates[idx] = {};
    templates[idx][k] = inp.value;
  });
  s.templates = templates.filter(t => t.name);

  // Files
  const files = [];
  els('[data-file-idx]', v2SettingsBody).forEach(inp => {
    const idx = inp.dataset.fileIdx;
    const k = inp.dataset.fileK;
    if (!files[idx]) files[idx] = {};
    files[idx][k] = inp.value;
  });
  s.files = files.filter(f => f.name);

  // Functions
  const logicFuncText = el('[data-v2="functions.logic"]', v2SettingsBody)?.value.trim();
  const pyFuncText = el('[data-v2="functions.python"]', v2SettingsBody)?.value.trim();

  if (logicFuncText || pyFuncText) {
    if (!s.functions) s.functions = {};
    if (logicFuncText) {
      try {
        s.functions.logic = JSON.parse(logicFuncText);
      } catch (e) {
        alert('Logic関数のJSON解析エラー: ' + e.message);
      }
    }
    if (pyFuncText) {
      try {
        s.functions.python = JSON.parse(pyFuncText);
      } catch (e) {
        alert('Python関数のJSON解析エラー: ' + e.message);
      }
    }
  }

  // Connections
  const connections = [];
  els('[data-conn-idx]', v2SettingsBody).forEach(inp => {
    const idx = inp.dataset.connIdx;
    const k = inp.dataset.connK;
    if (!connections[idx]) connections[idx] = {};
    connections[idx][k] = inp.value;
  });
  s.connections = connections.filter(c => c.from && c.to);

  v2SettingsModal.close();
}

// イベントハンドラ
v2SettingsBody.addEventListener('click', (e) => {
  // タブ切り替え
  const tabBtn = e.target.closest('.tab-btn');
  if (tabBtn) {
    const tabId = tabBtn.dataset.tab;

    // タブボタンのアクティブ状態を更新
    els('.tab-btn', v2SettingsBody).forEach(btn => btn.classList.remove('active'));
    tabBtn.classList.add('active');

    // タブペインのアクティブ状態を更新
    els('.tab-pane', v2SettingsBody).forEach(pane => pane.classList.remove('active'));
    el(`#tab-${tabId}`, v2SettingsBody).classList.add('active');
  }

  // Image追加 (v2.1)
  if (e.target.id === 'btnAddImage') {
    const container = el('#imagesContainer', v2SettingsBody);
    const existingCount = els('[data-image-idx]', container).length / 5; // name + path + url + media_type + base64 = 5要素
    container.insertAdjacentHTML('beforeend', buildImageRow({ name: '', path: '', url: '', media_type: 'image/png', base64: '' }, existingCount));
  }

  // Image削除
  if (e.target.dataset.act === 'delImage') {
    e.target.closest('fieldset').remove();
  }

  // Template追加
  if (e.target.id === 'btnAddTemplate') {
    const container = el('#templatesContainer', v2SettingsBody);
    const idx = els('[data-template-idx]', container).length / 2; // name + text = 2要素
    container.insertAdjacentHTML('beforeend', buildTemplateRow({ name: '', text: '' }, idx));
  }

  // Template削除
  if (e.target.dataset.act === 'delTemplate') {
    e.target.closest('fieldset').remove();
  }

  // File追加
  if (e.target.id === 'btnAddFile') {
    const container = el('#filesContainer', v2SettingsBody);
    const idx = els('[data-file-idx]', container).length / 3; // name + mime + content = 3要素
    container.insertAdjacentHTML('beforeend', buildFileRow({ name: '', mime: 'text/plain', content: '' }, idx));
  }

  // File削除
  if (e.target.dataset.act === 'delFile') {
    e.target.closest('fieldset').remove();
  }

  // Connection追加
  if (e.target.id === 'btnAddConnection') {
    const container = el('#connectionsContainer', v2SettingsBody);
    const idx = els('[data-conn-idx]', container).length / 4; // from + output + to + input = 4要素
    container.insertAdjacentHTML('beforeend', buildConnectionRow({ from: '', output: '', to: '', input: '' }, idx));
  }

  // Connection削除
  if (e.target.dataset.act === 'delConnection') {
    e.target.closest('fieldset').remove();
  }
});

btnSaveV2Settings.addEventListener('click', (e) => {
  e.preventDefault();
  saveV2Settings();
});
