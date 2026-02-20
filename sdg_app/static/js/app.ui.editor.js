// =========================
// MABEL Studio Frontend (ui.editor: ブロック編集モーダル UI一式)
// - 依存: app.core.js（DOM参照, state, utils）, app.graph.js（inferredInputs, autoAssignExecFromEdges, autolayoutByExec, drawConnections）
// - 提供: openEditor と各種フォームのbuild/read関数
// =========================

// -------------------------
// Editor (Modal) — タブUI版
// -------------------------
function openEditor(b) {
  editorTitle.textContent = `${b.type.toUpperCase()} — ${b.title || b.name || b.py_name || b.id}`;
  editorBody.innerHTML = '';

  els('.node').forEach(n => n.classList.remove('selected'));
  const selNode = el('#node-' + b.id);
  if (selNode) selNode.classList.add('selected');
  selectedBlockId = b.id;

  // ブロックタイプ別のタブ定義を取得
  let tabDefs;
  if (b.type === 'start') tabDefs = buildStartTabs(b);
  else if (b.type === 'ai') tabDefs = buildAiTabs(b);
  else if (b.type === 'logic') tabDefs = buildLogicTabs(b);
  else if (b.type === 'python') tabDefs = buildPythonTabs(b);
  else if (b.type === 'end') tabDefs = buildEndTabs(b);
  else return;

  // タブコンテナ
  const tabContainer = document.createElement('div');
  tabContainer.className = 'tabs-container editor-tabs';

  // タブナビゲーション
  const tabNav = document.createElement('div');
  tabNav.className = 'tabs-nav';
  tabDefs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.dataset.tab = `ed-${t.id}`;
    btn.innerHTML = t.label;
    tabNav.appendChild(btn);
  });

  // タブコンテンツ
  const tabContent = document.createElement('div');
  tabContent.className = 'tabs-content';
  tabDefs.forEach((t, i) => {
    const pane = document.createElement('div');
    pane.className = 'tab-pane' + (i === 0 ? ' active' : '');
    pane.id = `tab-ed-${t.id}`;
    if (t.element) pane.appendChild(t.element);
    tabContent.appendChild(pane);
  });

  tabContainer.appendChild(tabNav);
  tabContainer.appendChild(tabContent);
  editorBody.appendChild(tabContainer);

  // detected inputs 表示（フッター）
  const detected = inferredInputs(b);
  const infoDiv = document.createElement('div');
  infoDiv.className = 'editor-inputs-hint';
  infoDiv.innerHTML = `<p class="small-note">Detected inputs from <span class="kbd">{...}</span>: ${detected.map(x => `<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'
    }</p>`;
  editorBody.appendChild(infoDiv);

  // タブ切り替えイベント
  tabNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabId = btn.dataset.tab;
    els('.tab-btn', tabNav).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    els('.tab-pane', tabContent).forEach(p => p.classList.remove('active'));
    const target = el(`#tab-${tabId}`, tabContent);
    if (target) target.classList.add('active');
  });

  editorForm.onsubmit = (ev) => {
    ev.preventDefault();
    const titleEl = el('[data-k="title"]', editorBody);
    const execEl = el('[data-k="exec"]', editorBody);
    if (titleEl) b.title = titleEl.value.trim();
    if (execEl) b.exec = Number(execEl.value) || 1;

    if (b.type === 'start') readStartFormInto(b);
    if (b.type === 'ai') readAiFormInto(b);
    if (b.type === 'logic') readLogicFormInto(b);
    if (b.type === 'python') readPythonFormInto(b);
    if (b.type === 'end') readEndFormInto(b);

    autoAssignExecFromEdges();
    renderNodes();
    drawConnections();
    editorModal.close();
  };

  editorModal.showModal();
}

editorModal.addEventListener('close', () => {
  editorForm.onsubmit = null;
  els('.node').forEach(n => n.classList.remove('selected'));
  selectedBlockId = null;
});

// -------------------------
// 共通フィールド（title + exec）
// -------------------------
function makeCommonFields(b) {
  const div = document.createElement('div');
  div.className = 'form-grid';
  div.innerHTML = `
    <label>title<span class="field-hint">（UI表示用・YAMLには出力しません）</span></label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec<span class="field-hint">（実行順）</span></label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
  `;
  return div;
}

// -------------------------
// START ブロック
// -------------------------
function buildStartTabs(b) {
  const infoEl = document.createElement('div');
  infoEl.className = 'form-grid';
  infoEl.innerHTML = `
    <div class="full tab-section-note">
      <p>STARTブロックは入力を持たず、固定の出力「UserInput」を提供します。YAMLには出力されません。</p>
    </div>
    <label>title<span class="field-hint">（UI表示用）</span></label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec</label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
  `;
  return [{ id: 'basic', label: '基本設定', element: infoEl }];
}

function buildStartForm(b) { /* 旧互換 - 不使用 */ }

function readStartFormInto(b) {
  b.outputs = ['UserInput'];
}

// -------------------------
// AI ブロック
// -------------------------
function buildAiTabs(b) {
  // --- Tab 1: 基本設定 ---
  const basicEl = document.createElement('div');
  basicEl.className = 'form-grid';
  basicEl.innerHTML = `
    <label>title<span class="field-hint">（UI表示用）</span></label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec</label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
    <div class="form-divider full"></div>
    <label>model</label>
    <select data-k="model">${state.models.map(m =>
    `<option value="${escapeAttr(m.name)}" ${m.name === b.model ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
  ).join('')}</select>
    <label>mode<span class="field-hint">（v2）</span></label>
    <select data-k="mode">
      <option value="text" ${(b.mode || 'text') === 'text' ? 'selected' : ''}>text</option>
      <option value="json" ${b.mode === 'json' ? 'selected' : ''}>json</option>
    </select>
  `;

  // --- Tab 2: プロンプト ---
  const promptEl = document.createElement('div');
  promptEl.className = 'form-grid';
  promptEl.innerHTML = `
    <label class="full">system_prompt</label>
    <textarea class="full" rows="6" data-k="system_prompt">${escapeHtml(b.system_prompt || '')}</textarea>
    <label class="full">prompts<span class="field-hint">（複数要素は --- で区切り）</span></label>
    <textarea class="full" rows="9" data-k="prompts">${escapeHtml((b.prompts || ['']).join('\n---\n'))}</textarea>
  `;

  // --- Tab 3: 出力 ---
  const outputsEl = document.createElement('div');
  outputsEl.className = 'form-grid';
  outputsEl.innerHTML = `
    <fieldset class="inline-list full" id="aiOutputs">
      <legend class="inline-list-legend">outputs<span class="field-hint">（必須）</span></legend>
      <div class="hdr"><div>name</div><div>select</div><div>tag/path</div><div>regex</div><div>type_hint</div><div>del</div></div>
      ${(b.outputs || []).map((o, i) => aiOutputRow(o, i)).join('')}
      <button type="button" class="accent btn-add-row" id="btnAddOut">+ add output</button>
    </fieldset>
  `;
  outputsEl.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddOut') {
      const fieldset = el('#aiOutputs', outputsEl);
      const o = { name: 'Out_' + Math.random().toString(36).slice(2, 6), select: 'full', tag: '', regex: '', path: '', type_hint: '', join_with: '' };
      fieldset.insertAdjacentHTML('beforeend', aiOutputRow(o, 0));
    }
    if (e.target.matches('[data-act="delOut"]')) {
      const row = e.target.closest('.row');
      const next = row?.nextElementSibling;
      if (next && next.querySelector('[data-o="join_with"]')) next.remove();
      row.remove();
    }
  });

  // --- Tab 4: 詳細 ---
  const advEl = document.createElement('div');
  advEl.className = 'form-grid';
  advEl.innerHTML = `
    <div class="section-title full">save_to <span class="badge">v2</span></div>
    <label class="full">vars<span class="field-hint">（変数名: 出力名、例: memo: Answer）</span></label>
    <textarea class="full" rows="3" data-k="save_to_vars" placeholder="memo: Answer">${b.save_to?.vars ? Object.entries(b.save_to.vars).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
    }</textarea>

    <div class="section-title full">params<span class="field-hint">（モデルdefaultsを上書き）</span></div>
    ${['temperature', 'top_p', 'max_tokens'].map(k => `
      <label>${k}</label><input data-param="${k}" value="${escapeAttr(b.params?.[k] ?? '')}">
    `).join('')}
    <label>stop<span class="field-hint">（カンマ区切り）</span></label>
    <input data-param="stop" value="${escapeAttr((b.params?.stop || []).join(','))}">
  `;

  // --- Tab 5: 実行制御 ---
  const execCtrlEl = document.createElement('div');
  execCtrlEl.className = 'form-grid';
  execCtrlEl.innerHTML = `
    <label class="full">run_if<span class="field-hint">（JSON/MEX: 例 {"equals":["{Flag}","on"]}）</span></label>
    <input data-k="run_if" class="full" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
    <label>on_error</label>
    <select data-k="on_error">
      <option value="">(default: fail)</option>
      <option value="fail"     ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
      <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
      <option value="retry"    ${b.on_error === 'retry' ? 'selected' : ''}>retry</option>
    </select>
    <label class="full">retry<span class="field-hint">（JSON: {"max_attempts":2, "backoff":{"type":"exponential","base_ms":500}}）</span></label>
    <input data-k="retry" class="full" value='${b.retry ? escapeAttr(JSON.stringify(b.retry)) : ''}'>
    <div class="section-title full">budget <span class="badge">v2</span></div>
    <label class="full">budget<span class="field-hint">（JSON: {"ai":{"max_calls":5}}）</span></label>
    <input data-k="budget" class="full" value='${b.budget ? escapeAttr(JSON.stringify(b.budget)) : ''}'>
  `;

  return [
    { id: 'basic', label: '基本設定', element: basicEl },
    { id: 'prompt', label: 'プロンプト', element: promptEl },
    { id: 'outputs', label: '出力', element: outputsEl },
    { id: 'adv', label: '詳細', element: advEl },
    { id: 'exec', label: '実行制御', element: execCtrlEl },
  ];
}

function aiOutputRow(o, i) {
  return `
    <div class="row">
      <input placeholder="name" data-o="name" value="${escapeAttr(o.name || '')}">
      <select data-o="select">
        <option value="full"     ${(o.select || 'full') === 'full' ? 'selected' : ''}>full</option>
        <option value="tag"      ${o.select === 'tag' ? 'selected' : ''}>tag</option>
        <option value="regex"    ${o.select === 'regex' ? 'selected' : ''}>regex</option>
        <option value="jsonpath" ${o.select === 'jsonpath' ? 'selected' : ''}>jsonpath</option>
      </select>
      <input placeholder="tag/path" data-o="tag_or_path" value="${escapeAttr(o.tag || o.path || '')}">
      <input placeholder="regex"    data-o="regex"        value="${escapeAttr(o.regex || '')}">
      <input placeholder="type_hint" data-o="type_hint"  value="${escapeAttr(o.type_hint || '')}">
      <button type="button" class="del" data-act="delOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
    </div>
    <div class="row">
      <input class="full" placeholder="join_with（select=tag時の複数結合）" data-o="join_with" value="${escapeAttr(o.join_with || '')}">
    </div>
  `;
}

function readAiFormInto(b) {
  b.model = el('[data-k="model"]', editorBody)?.value.trim();
  b.system_prompt = el('[data-k="system_prompt"]', editorBody)?.value || '';
  b.prompts = (el('[data-k="prompts"]', editorBody)?.value || '').split(/\n---\n/g);

  const mode = el('[data-k="mode"]', editorBody)?.value || 'text';
  b.mode = mode;

  const outRows = els('#aiOutputs .row', editorBody);
  const outputs = [];
  for (let i = 0; i < outRows.length; i += 2) {
    const rMain = outRows[i];
    const rJoin = outRows[i + 1];
    if (!rMain) continue;
    const name = el('[data-o="name"]', rMain)?.value.trim();
    const select = el('[data-o="select"]', rMain)?.value || 'full';
    const tagOrPath = el('[data-o="tag_or_path"]', rMain)?.value.trim();
    const regex = el('[data-o="regex"]', rMain)?.value.trim();
    const typeHint = el('[data-o="type_hint"]', rMain)?.value.trim();
    const joinWith = rJoin ? el('[data-o="join_with"]', rJoin)?.value : '';
    if (!name) continue;
    const o = { name, select };
    if (select === 'tag' && tagOrPath) o.tag = tagOrPath;
    if (select === 'jsonpath' && tagOrPath) o.path = tagOrPath;
    if (select === 'regex' && regex) o.regex = regex;
    if (joinWith) o.join_with = joinWith;
    if (typeHint) o.type_hint = typeHint;
    outputs.push(o);
  }
  b.outputs = outputs;

  // save_to
  const saveToVarsText = el('[data-k="save_to_vars"]', editorBody)?.value.trim() || '';
  if (saveToVarsText) {
    const vars = {};
    saveToVarsText.split('\n').forEach(line => {
      const match = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
      if (match) vars[match[1]] = match[2];
    });
    b.save_to = Object.keys(vars).length > 0 ? { vars } : undefined;
  } else {
    b.save_to = undefined;
  }

  // params
  const params = {};
  els('[data-param]', editorBody).forEach(inp => {
    const k = inp.dataset.param;
    if (k === 'stop') {
      const arr = inp.value.split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) params.stop = arr;
    } else {
      const v = inp.value.trim();
      if (v !== '') params[k] = toMaybeNumber(v);
    }
  });
  b.params = params;

  const runIfStr = el('[data-k="run_if"]', editorBody)?.value.trim() || '';
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;

  const oe = el('[data-k="on_error"]', editorBody)?.value || '';
  b.on_error = oe || undefined;

  const retryStr = el('[data-k="retry"]', editorBody)?.value.trim() || '';
  b.retry = retryStr ? safeParseJson(retryStr, null) : undefined;

  const budgetStr = el('[data-k="budget"]', editorBody)?.value.trim() || '';
  b.budget = budgetStr ? safeParseJson(budgetStr, null) : undefined;
}

// -------------------------
// LOGIC ブロック
// -------------------------
function buildLogicTabs(b) {
  const currentOp = b.op || 'if';

  const opSections = {
    if: ['if_section'],
    and: ['operands_section'],
    or: ['operands_section'],
    not: ['operands_section'],
    for: ['for_section'],
    set: ['set_section'],
    let: ['let_section'],
    reduce: ['reduce_section'],
    while: ['while_section'],
    call: ['call_section'],
    emit: ['emit_section'],
    recurse: ['recurse_section'],
  };

  const opOutputFromOptions = {
    if: ['boolean', 'value'],
    and: ['boolean'],
    or: ['boolean'],
    not: ['boolean'],
    for: ['count', 'list', 'join', 'any', 'all', 'first', 'last'],
    set: ['value'],
    let: ['value'],
    reduce: ['value'],
    while: ['value', 'count'],
    call: ['value'],
    emit: [],
    recurse: ['value'],
  };

  // --- Tab 1: 基本設定 ---
  const basicEl = document.createElement('div');
  basicEl.className = 'form-grid';
  basicEl.innerHTML = `
    <label>title<span class="field-hint">（UI表示用）</span></label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec</label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
    <div class="form-divider full"></div>
    <label>name<span class="field-hint">（任意）</span></label>
    <input data-k="name" value="${escapeAttr(b.name || '')}">
    <label>op<span class="field-hint">（ロジック種別）</span></label>
    <select data-k="op" id="logicOpSelect">
      <option value="if"      ${currentOp === 'if' ? 'selected' : ''}>if</option>
      <option value="and"     ${currentOp === 'and' ? 'selected' : ''}>and</option>
      <option value="or"      ${currentOp === 'or' ? 'selected' : ''}>or</option>
      <option value="not"     ${currentOp === 'not' ? 'selected' : ''}>not</option>
      <option value="for"     ${currentOp === 'for' ? 'selected' : ''}>for</option>
      <option value="while"   ${currentOp === 'while' ? 'selected' : ''}>while <span class="badge">v2</span></option>
      <option value="set"     ${currentOp === 'set' ? 'selected' : ''}>set <span class="badge">v2</span></option>
      <option value="let"     ${currentOp === 'let' ? 'selected' : ''}>let <span class="badge">v2</span></option>
      <option value="reduce"  ${currentOp === 'reduce' ? 'selected' : ''}>reduce <span class="badge">v2</span></option>
      <option value="call"    ${currentOp === 'call' ? 'selected' : ''}>call <span class="badge">v2</span></option>
      <option value="emit"    ${currentOp === 'emit' ? 'selected' : ''}>emit <span class="badge">v2</span></option>
      <option value="recurse" ${currentOp === 'recurse' ? 'selected' : ''}>recurse <span class="badge">v2</span></option>
    </select>
  `;

  // --- Tab 2: ロジック設定 ---
  const logicEl = document.createElement('div');
  logicEl.id = 'logicOpSections';
  logicEl.innerHTML = `
    <!-- if -->
    <div class="form-grid logic-section" data-section="if_section" style="display:${currentOp === 'if' ? 'grid' : 'none'}">
      <h4 class="full section-heading">条件・分岐設定</h4>
      <label class="full">cond<span class="field-hint">（JSON: 条件式）</span></label>
      <input class="full" data-k="cond" value='${escapeAttr(JSON.stringify(b.cond || {}))}'>
      <label>then<span class="field-hint">（条件成立時）</span></label>
      <input data-k="then" value="${escapeAttr(b.then || '')}" placeholder="run / skip / exec番号">
      <label>else<span class="field-hint">（条件不成立時）</span></label>
      <input data-k="else" value="${escapeAttr(b.else || '')}" placeholder="run / skip / exec番号">
    </div>

    <!-- operands (and/or/not) -->
    <div class="form-grid logic-section" data-section="operands_section" style="display:${['and', 'or', 'not'].includes(currentOp) ? 'grid' : 'none'}">
      <h4 class="full section-heading">${currentOp === 'not' ? '否定対象' : '論理演算対象'}</h4>
      <label class="full">operands<span class="field-hint">（JSON配列）</span></label>
      <textarea class="full" rows="6" data-k="operands" placeholder='[{"equals": ["{Var}", "value"]}]'>${b.operands ? escapeHtml(JSON.stringify(b.operands, null, 2)) : ''}</textarea>
    </div>

    <!-- for -->
    <div class="form-grid logic-section" data-section="for_section" style="display:${currentOp === 'for' ? 'grid' : 'none'}">
      <h4 class="full section-heading">ループ設定</h4>
      <label>list<span class="field-hint">（リストソース）</span></label>
      <input class="full" data-k="list" value="${escapeAttr(b.list || '')}" placeholder="{Items}">
      <label>parse</label>
      <select data-k="parse">
        <option value="">(default: lines)</option>
        <option value="lines"  ${b.parse === 'lines' ? 'selected' : ''}>lines</option>
        <option value="csv"    ${b.parse === 'csv' ? 'selected' : ''}>csv</option>
        <option value="json"   ${b.parse === 'json' ? 'selected' : ''}>json</option>
        <option value="regex"  ${b.parse === 'regex' ? 'selected' : ''}>regex</option>
      </select>
      <label>regex_pattern</label>
      <input data-k="regex_pattern" class="full" value="${escapeAttr(b.regex_pattern || '')}">
      <label>var<span class="field-hint">（ループ変数名）</span></label>
      <input data-k="var" value="${escapeAttr(b.var || '')}" placeholder="item">
      <label>drop_empty</label>
      <select data-k="drop_empty">
        <option value="">(default: true)</option>
        <option value="true"  ${b.drop_empty === true ? 'selected' : ''}>true</option>
        <option value="false" ${b.drop_empty === false ? 'selected' : ''}>false</option>
      </select>
      <label class="full">where<span class="field-hint">（フィルタ条件, JSON）</span></label>
      <input data-k="where" class="full" value='${b.where ? escapeAttr(JSON.stringify(b.where)) : ''}' placeholder='{"gt": ["{item.length}", 0]}'>
      <label class="full">map<span class="field-hint">（変換テンプレート）</span></label>
      <input data-k="map" class="full" value="${escapeAttr(b.map || '')}">
    </div>

    <!-- set -->
    <div class="form-grid logic-section" data-section="set_section" style="display:${currentOp === 'set' ? 'grid' : 'none'}">
      <h4 class="full section-heading">変数設定</h4>
      <label>var<span class="field-hint">（変数名）</span></label>
      <input class="full" data-k="set_var" value="${escapeAttr(b.var || '')}" placeholder="MyVariable">
      <label class="full">value<span class="field-hint">（JSON/MEX式）</span></label>
      <textarea class="full" rows="4" data-k="set_value">${escapeHtml(typeof b.value === 'object' ? JSON.stringify(b.value, null, 2) : (b.value || ''))}</textarea>
    </div>

    <!-- let -->
    <div class="form-grid logic-section" data-section="let_section" style="display:${currentOp === 'let' ? 'grid' : 'none'}">
      <h4 class="full section-heading">ローカルスコープ設定</h4>
      <label class="full">bindings<span class="field-hint">（JSON: ローカル変数束縛）</span></label>
      <textarea class="full" rows="4" data-k="let_bindings" placeholder='{"x": "{Input}", "y": 10}'>${escapeHtml(b.bindings ? JSON.stringify(b.bindings, null, 2) : '')}</textarea>
      <label class="full">body<span class="field-hint">（JSON: 実行式）</span></label>
      <textarea class="full" rows="5" data-k="let_body" placeholder='{"add": ["{x}", "{y}"]}'>${escapeHtml(b.body ? JSON.stringify(b.body, null, 2) : '')}</textarea>
    </div>

    <!-- reduce -->
    <div class="form-grid logic-section" data-section="reduce_section" style="display:${currentOp === 'reduce' ? 'grid' : 'none'}">
      <h4 class="full section-heading">累積処理設定</h4>
      <label>list</label>
      <input class="full" data-k="reduce_list" value="${escapeAttr(b.list || '')}" placeholder="{Items}">
      <label>value<span class="field-hint">（初期値）</span></label>
      <input class="full" data-k="reduce_value" value="${escapeAttr(typeof b.value === 'object' ? JSON.stringify(b.value) : (b.value ?? ''))}">
      <label>var</label>
      <input data-k="reduce_var" value="${escapeAttr(b.var || '')}" placeholder="item">
      <label>accumulator</label>
      <input data-k="reduce_accumulator" value="${escapeAttr(b.accumulator || '')}" placeholder="acc">
      <label class="full">body<span class="field-hint">（JSON: 累積ロジック）</span></label>
      <textarea class="full" rows="5" data-k="reduce_body" placeholder='{"add": ["{acc}", 1]}'>${escapeHtml(b.body ? JSON.stringify(b.body, null, 2) : '')}</textarea>
    </div>

    <!-- while -->
    <div class="form-grid logic-section" data-section="while_section" style="display:${currentOp === 'while' ? 'grid' : 'none'}">
      <h4 class="full section-heading">Whileループ設定</h4>
      <label class="full">init<span class="field-hint">（JSON: 初期化）</span></label>
      <textarea class="full" rows="3" data-k="while_init" placeholder='{"counter": 0}'>${escapeHtml(b.init ? JSON.stringify(b.init, null, 2) : '')}</textarea>
      <label class="full">cond<span class="field-hint">（JSON: ループ継続条件）</span></label>
      <textarea class="full" rows="2" data-k="while_cond" placeholder='{"lt": ["{counter}", 10]}'>${escapeHtml(b.cond ? JSON.stringify(b.cond, null, 2) : '')}</textarea>
      <label class="full">step<span class="field-hint">（JSON: ループ本体）</span></label>
      <textarea class="full" rows="5" data-k="while_step" placeholder='{"set": {"counter": {"add": ["{counter}", 1]}}}'>${escapeHtml(b.step ? JSON.stringify(b.step, null, 2) : '')}</textarea>
      <label class="full">budget<span class="field-hint">（JSON: 予算）</span></label>
      <input class="full" data-k="while_budget" value='${b.budget ? escapeAttr(JSON.stringify(b.budget)) : ''}' placeholder='{"max_iters": 100}'>
    </div>

    <!-- call -->
    <div class="form-grid logic-section" data-section="call_section" style="display:${currentOp === 'call' ? 'grid' : 'none'}">
      <h4 class="full section-heading">関数呼び出し設定</h4>
      <label>function<span class="field-hint">（関数名）</span></label>
      <input class="full" data-k="call_function" value="${escapeAttr(typeof b.function === 'string' ? b.function : '')}" placeholder="myFunction">
      <label class="full">with<span class="field-hint">（JSON: 引数マッピング）</span></label>
      <textarea class="full" rows="4" data-k="call_with" placeholder='{"arg1": "{Input1}"}'>${escapeHtml(b.with ? JSON.stringify(b.with, null, 2) : '')}</textarea>
      <label class="full">returns<span class="field-hint">（カンマ区切り）</span></label>
      <input class="full" data-k="call_returns" value="${escapeAttr((b.returns || []).join(', '))}" placeholder="result, status">
    </div>

    <!-- emit -->
    <div class="form-grid logic-section" data-section="emit_section" style="display:${currentOp === 'emit' ? 'grid' : 'none'}">
      <h4 class="full section-heading">値発行設定</h4>
      <p class="small-note full">emitブロックは値を発行するため、通常outputsは不要です。</p>
      <label class="full">value<span class="field-hint">（JSON/MEX式）</span></label>
      <textarea class="full" rows="4" data-k="emit_value" placeholder="{OutputValue}">${escapeHtml(typeof b.value === 'object' ? JSON.stringify(b.value, null, 2) : (b.value || ''))}</textarea>
    </div>

    <!-- recurse -->
    <div class="form-grid logic-section" data-section="recurse_section" style="display:${currentOp === 'recurse' ? 'grid' : 'none'}">
      <h4 class="full section-heading">再帰処理設定</h4>
      <label class="full">function<span class="field-hint">（JSON: 再帰関数定義）</span></label>
      <textarea class="full" rows="10" data-k="recurse_function" placeholder='{"args":["n"],"returns":["result"],"base_case":{...},"body":{...}}'>${escapeHtml(typeof b.function === 'object' ? JSON.stringify(b.function, null, 2) : '')}</textarea>
      <label class="full">with<span class="field-hint">（JSON: 初期呼び出し引数）</span></label>
      <textarea class="full" rows="3" data-k="recurse_with" placeholder='{"n": 10}'>${escapeHtml(b.with ? JSON.stringify(b.with, null, 2) : '')}</textarea>
      <label class="full">budget<span class="field-hint">（JSON: 再帰深度制限）</span></label>
      <input class="full" data-k="recurse_budget" value='${b.budget ? escapeAttr(JSON.stringify(b.budget)) : ''}' placeholder='{"max_depth": 10}'>
    </div>
  `;

  // op選択でセクション切り替え
  const opSelect = basicEl.querySelector('#logicOpSelect');
  opSelect.addEventListener('change', (e) => {
    const newOp = e.target.value;
    const sectionsToShow = opSections[newOp] || [];
    logicEl.querySelectorAll('.logic-section').forEach(sec => {
      sec.style.display = sectionsToShow.includes(sec.dataset.section) ? 'grid' : 'none';
    });
    const operandsTitle = logicEl.querySelector('[data-section="operands_section"] .section-heading');
    if (operandsTitle) operandsTitle.textContent = newOp === 'not' ? '否定対象' : '論理演算対象';
    // emit時はoutputsタブのsectionを隠す（後でDOM検索）
    const outputsSection = el('#logicOutputsFieldset', editorBody);
    if (outputsSection) outputsSection.style.display = newOp === 'emit' ? 'none' : '';
  });

  // --- Tab 3: 出力 ---
  const outputsEl = document.createElement('div');
  outputsEl.className = 'form-grid';
  outputsEl.innerHTML = `
    <fieldset class="inline-list full" id="logicOutputs" ${currentOp === 'emit' ? 'style="display:none"' : ''} id="logicOutputsFieldset">
      <legend class="inline-list-legend">outputs<span class="field-hint">（任意）</span></legend>
      <div class="hdr"><div>name</div><div>from</div><div>source</div><div>join_with</div><div>del</div></div>
      ${(b.outputs || []).map(o => logicOutputRow(o, currentOp)).join('')}
      <button type="button" class="accent btn-add-row" id="btnAddLogicOut">+ add output</button>
    </fieldset>
  `;
  // emitの場合はfieldsetをid変更で対応
  const logicOutputsFs = outputsEl.querySelector('#logicOutputs');
  if (logicOutputsFs) logicOutputsFs.id = 'logicOutputsFieldset';

  outputsEl.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddLogicOut') {
      const fs = el('#logicOutputsFieldset', editorBody);
      const curOp = el('[data-k="op"]', editorBody)?.value || currentOp;
      const defaultFrom = (opOutputFromOptions[curOp] || ['boolean'])[0] || 'boolean';
      fs.insertAdjacentHTML('beforeend', logicOutputRow({ name: 'Out_' + Math.random().toString(36).slice(2, 6), from: defaultFrom }, curOp));
    }
    if (e.target.dataset.act === 'delOut') {
      const row = e.target.closest('.row');
      const next = row?.nextElementSibling;
      if (next && (next.querySelector('[data-o="test"]') || next.querySelector('[data-o="limit"]'))) next.remove();
      row.remove();
    }
  });

  // --- Tab 4: 実行制御 ---
  const execCtrlEl = document.createElement('div');
  execCtrlEl.className = 'form-grid';
  execCtrlEl.innerHTML = `
    <label class="full">run_if<span class="field-hint">（JSON: 実行条件）</span></label>
    <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}' placeholder='{"equals": ["{Flag}", "on"]}'>
    <label>on_error</label>
    <select data-k="on_error">
      <option value="">(default: fail)</option>
      <option value="fail"     ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
      <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
    </select>
  `;

  return [
    { id: 'basic', label: '基本設定', element: basicEl },
    { id: 'logic', label: 'ロジック設定', element: logicEl },
    { id: 'outputs', label: '出力', element: outputsEl },
    { id: 'exec', label: '実行制御', element: execCtrlEl },
  ];
}

function logicOutputRow(o, opType = 'if') {
  const opOutputFromOptions = {
    if: ['boolean', 'value'],
    and: ['boolean'],
    or: ['boolean'],
    not: ['boolean'],
    for: ['count', 'list', 'join', 'any', 'all', 'first', 'last'],
    set: ['value'],
    let: ['value'],
    reduce: ['value'],
    while: ['value', 'count'],
    call: ['value'],
    emit: [],
    recurse: ['value'],
  };
  const fromLabels = {
    boolean: 'boolean（真偽値）', value: 'value（計算結果）', join: 'join（結合文字列）',
    count: 'count（件数）', list: 'list（リスト）', any: 'any（いずれか）',
    all: 'all（すべて）', first: 'first（最初）', last: 'last（最後）',
  };

  const availableFrom = opOutputFromOptions[opType] || ['boolean', 'value'];
  const showForFields = opType === 'for';
  const showJoinWith = availableFrom.includes('join') || o.from === 'join';

  let html = `
    <div class="row">
      <input placeholder="name" data-o="name" value="${escapeAttr(o.name || '')}">
      <select data-o="from">
        ${availableFrom.map(opt =>
    `<option value="${opt}" ${o.from === opt ? 'selected' : ''}>${fromLabels[opt] || opt}</option>`
  ).join('')}
      </select>
      ${showForFields ? `
        <select data-o="source">
          <option value="" ${!o.source ? 'selected' : ''}>(default)</option>
          <option value="raw"      ${o.source === 'raw' ? 'selected' : ''}>raw</option>
          <option value="filtered" ${o.source === 'filtered' ? 'selected' : ''}>filtered</option>
          <option value="mapped"   ${o.source === 'mapped' ? 'selected' : ''}>mapped</option>
        </select>
      ` : '<div></div>'}
      ${showJoinWith ? `
        <input placeholder="join_with" data-o="join_with" value="${escapeAttr(o.join_with || '')}">
      ` : '<div></div>'}
      <button type="button" class="del" data-act="delOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
    </div>`;

  if (showForFields) {
    html += `
    <div class="row">
      <input placeholder='test（JSON, any/all用）' data-o="test" value='${o.test ? escapeAttr(JSON.stringify(o.test)) : ''}'>
      <input placeholder="limit" data-o="limit"   value="${o.limit ?? ''}">
      <input placeholder="offset" data-o="offset" value="${o.offset ?? ''}">
      <div></div><div></div>
    </div>`;
  }
  return html;
}

function readLogicFormInto(b) {
  b.name = el('[data-k="name"]', editorBody)?.value.trim() || undefined;
  const newOp = el('[data-k="op"]', editorBody)?.value || 'if';
  b.op = newOp;

  switch (newOp) {
    case 'if': {
      const condStr = el('[data-k="cond"]', editorBody)?.value.trim() || '';
      b.cond = condStr ? safeParseJson(condStr, {}) : undefined;
      b.then = el('[data-k="then"]', editorBody)?.value || undefined;
      b.else = el('[data-k="else"]', editorBody)?.value || undefined;
      delete b.operands; delete b.list; delete b.parse; delete b.regex_pattern;
      delete b.var; delete b.drop_empty; delete b.where; delete b.map;
      delete b.value; delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget; delete b.function;
      delete b.with; delete b.returns;
      break;
    }
    case 'and': case 'or': case 'not': {
      const opsStr = el('[data-k="operands"]', editorBody)?.value.trim() || '';
      b.operands = opsStr ? safeParseJson(opsStr, []) : undefined;
      delete b.cond; delete b.then; delete b.else;
      delete b.list; delete b.parse; delete b.regex_pattern;
      delete b.var; delete b.drop_empty; delete b.where; delete b.map;
      delete b.value; delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget; delete b.function;
      delete b.with; delete b.returns;
      break;
    }
    case 'for': {
      b.list = el('[data-k="list"]', editorBody)?.value || undefined;
      b.parse = el('[data-k="parse"]', editorBody)?.value || undefined;
      b.regex_pattern = el('[data-k="regex_pattern"]', editorBody)?.value || undefined;
      b.var = el('[data-k="var"]', editorBody)?.value.trim() || undefined;
      const dropSel = el('[data-k="drop_empty"]', editorBody)?.value || '';
      b.drop_empty = dropSel === '' ? undefined : (dropSel === 'true');
      const whereStr = el('[data-k="where"]', editorBody)?.value.trim() || '';
      b.where = whereStr ? safeParseJson(whereStr, null) : undefined;
      b.map = el('[data-k="map"]', editorBody)?.value || undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.value; delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget; delete b.function;
      delete b.with; delete b.returns;
      break;
    }
    case 'set': {
      b.var = el('[data-k="set_var"]', editorBody)?.value.trim() || undefined;
      const setValueStr = el('[data-k="set_value"]', editorBody)?.value.trim() || '';
      b.value = setValueStr ? safeParseJson(setValueStr, setValueStr) : undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.drop_empty;
      delete b.where; delete b.map; delete b.bindings; delete b.body;
      delete b.accumulator; delete b.init; delete b.step; delete b.budget;
      delete b.function; delete b.with; delete b.returns;
      break;
    }
    case 'let': {
      const bindingsStr = el('[data-k="let_bindings"]', editorBody)?.value.trim() || '';
      b.bindings = bindingsStr ? safeParseJson(bindingsStr, {}) : undefined;
      const bodyStr = el('[data-k="let_body"]', editorBody)?.value.trim() || '';
      b.body = bodyStr ? safeParseJson(bodyStr, {}) : undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.accumulator; delete b.init; delete b.step; delete b.budget;
      delete b.function; delete b.with; delete b.returns;
      break;
    }
    case 'reduce': {
      b.list = el('[data-k="reduce_list"]', editorBody)?.value.trim() || undefined;
      const valStr = el('[data-k="reduce_value"]', editorBody)?.value.trim() || '';
      b.value = valStr ? safeParseJson(valStr, valStr) : undefined;
      b.var = el('[data-k="reduce_var"]', editorBody)?.value.trim() || undefined;
      b.accumulator = el('[data-k="reduce_accumulator"]', editorBody)?.value.trim() || undefined;
      const bodyStr = el('[data-k="reduce_body"]', editorBody)?.value.trim() || '';
      b.body = bodyStr ? safeParseJson(bodyStr, {}) : undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.parse; delete b.regex_pattern; delete b.drop_empty; delete b.where;
      delete b.map; delete b.bindings; delete b.init; delete b.step;
      delete b.budget; delete b.function; delete b.with; delete b.returns;
      break;
    }
    case 'while': {
      const initStr = el('[data-k="while_init"]', editorBody)?.value.trim() || '';
      b.init = initStr ? safeParseJson(initStr, {}) : undefined;
      const condStr = el('[data-k="while_cond"]', editorBody)?.value.trim() || '';
      b.cond = condStr ? safeParseJson(condStr, {}) : undefined;
      const stepStr = el('[data-k="while_step"]', editorBody)?.value.trim() || '';
      b.step = stepStr ? safeParseJson(stepStr, {}) : undefined;
      const budgStr = el('[data-k="while_budget"]', editorBody)?.value.trim() || '';
      b.budget = budgStr ? safeParseJson(budgStr, null) : undefined;
      delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.bindings; delete b.body; delete b.accumulator;
      delete b.function; delete b.with; delete b.returns;
      break;
    }
    case 'call': {
      b.function = el('[data-k="call_function"]', editorBody)?.value.trim() || undefined;
      const withStr = el('[data-k="call_with"]', editorBody)?.value.trim() || '';
      b.with = withStr ? safeParseJson(withStr, {}) : undefined;
      const retStr = el('[data-k="call_returns"]', editorBody)?.value.trim() || '';
      b.returns = retStr ? retStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget;
      break;
    }
    case 'emit': {
      const valStr = el('[data-k="emit_value"]', editorBody)?.value.trim() || '';
      b.value = valStr ? safeParseJson(valStr, valStr) : undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.bindings;
      delete b.body; delete b.accumulator; delete b.init; delete b.step;
      delete b.budget; delete b.function; delete b.with; delete b.returns;
      b.outputs = [];
      break;
    }
    case 'recurse': {
      const funcStr = el('[data-k="recurse_function"]', editorBody)?.value.trim() || '';
      b.function = funcStr ? safeParseJson(funcStr, {}) : undefined;
      const withStr = el('[data-k="recurse_with"]', editorBody)?.value.trim() || '';
      b.with = withStr ? safeParseJson(withStr, {}) : undefined;
      const budgStr = el('[data-k="recurse_budget"]', editorBody)?.value.trim() || '';
      b.budget = budgStr ? safeParseJson(budgStr, null) : undefined;
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.returns;
      break;
    }
  }

  if (newOp !== 'emit') {
    const rows = els('#logicOutputsFieldset .row', editorBody);
    const outs = [];
    let i = 0;
    while (i < rows.length) {
      const r1 = rows[i];
      if (!r1) { i++; continue; }
      const nameEl = el('[data-o="name"]', r1);
      if (!nameEl) { i++; continue; }
      const name = nameEl.value.trim();
      if (!name) { i++; continue; }
      const from = el('[data-o="from"]', r1)?.value || 'boolean';
      const srcEl = el('[data-o="source"]', r1);
      const src = srcEl ? srcEl.value?.trim() || '' : '';
      const jwEl = el('[data-o="join_with"]', r1);
      const jw = jwEl ? jwEl.value || '' : '';
      const o = { name, from };
      if (src) o.source = src;
      if (jw) o.join_with = jw;
      if (newOp === 'for' && i + 1 < rows.length) {
        const r2 = rows[i + 1];
        const testEl = el('[data-o="test"]', r2);
        if (testEl) {
          const testStr = testEl.value.trim();
          const limitStr = el('[data-o="limit"]', r2)?.value.trim() || '';
          const offsetStr = el('[data-o="offset"]', r2)?.value.trim() || '';
          if (testStr) { const p = safeParseJson(testStr, null); if (p !== null) o.test = p; }
          if (limitStr) o.limit = toMaybeNumber(limitStr);
          if (offsetStr) o.offset = toMaybeNumber(offsetStr);
          i += 2; outs.push(o); continue;
        }
      }
      i++; outs.push(o);
    }
    b.outputs = outs;
  }

  const runIfStr = el('[data-k="run_if"]', editorBody)?.value.trim() || '';
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : undefined;
  b.on_error = el('[data-k="on_error"]', editorBody)?.value || undefined;
}

// -------------------------
// PYTHON ブロック
// -------------------------
function buildPythonTabs(b) {
  // --- Tab 1: 基本設定 ---
  const basicEl = document.createElement('div');
  basicEl.className = 'form-grid';
  basicEl.innerHTML = `
    <label>title<span class="field-hint">（UI表示用）</span></label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec</label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
    <div class="form-divider full"></div>
    <label>name<span class="field-hint">（必須）</span></label>
    <input data-k="py_name" value="${escapeAttr(b.py_name || '')}">
    <label>function / entrypoint<span class="field-hint">（必須）</span></label>
    <input data-k="function" value="${escapeAttr(b.function || b.entrypoint || '')}">
    <label class="full">inputs<span class="field-hint">（カンマ区切り：例 Answer, Plan）</span></label>
    <input class="full" data-k="inputs" placeholder="例: Answer, Plan" value="${escapeAttr((b.inputs || []).join(', '))}">
    <p class="small-note full">利用可能な出力: ${allOutputNames().map(x => `<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</p>
  `;

  // --- Tab 2: コード ---
  const codeEl = document.createElement('div');
  codeEl.className = 'form-grid';
  codeEl.innerHTML = `
    <label class="full">function_code<span class="field-hint">（v2: インライン関数。空の場合はcode_pathを使用）</span></label>
    <textarea class="full code-textarea" rows="18" data-k="function_code" spellcheck="false" placeholder="def main(ctx, **inputs):\n    return {'Output': value}">${escapeHtml(b.function_code || '')}</textarea>
    <div class="section-title full">code_path / venv_path<span class="field-hint">（v1 互換）</span></div>
    <label>code_path</label>
    <input class="full" data-k="code_path" value="${escapeAttr(b.code_path || '')}">
    <label>venv_path<span class="field-hint">（非推奨）</span></label>
    <input class="full" data-k="venv_path" value="${escapeAttr(b.venv_path || '')}">
  `;

  // --- Tab 3: 出力 ---
  const outputsEl = document.createElement('div');
  outputsEl.className = 'form-grid';
  outputsEl.innerHTML = `
    <fieldset class="inline-list full" id="pyOutputs">
      <legend class="inline-list-legend">outputs<span class="field-hint">（必須）</span></legend>
      ${(b.py_outputs || []).map(o => `
        <div class="row python">
          <input placeholder="output name" data-o="py_out" value="${escapeAttr(o)}">
          <div></div>
          <button type="button" class="del" data-act="delPyOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
        </div>
      `).join('')}
      <button type="button" class="accent btn-add-row" id="btnAddPyOut">+ add output</button>
    </fieldset>
  `;
  outputsEl.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddPyOut') {
      el('#pyOutputs', outputsEl).insertAdjacentHTML('beforeend', `
        <div class="row python">
          <input placeholder="output name" data-o="py_out">
          <div></div>
          <button type="button" class="del" data-act="delPyOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
        </div>
      `);
    }
    if (e.target.dataset.act === 'delPyOut') e.target.closest('.row').remove();
  });

  // --- Tab 4: 詳細設定 ---
  const advEl = document.createElement('div');
  advEl.className = 'form-grid';
  advEl.innerHTML = `
    <div class="section-title full">v2 拡張設定</div>
    <label>use_env</label>
    <select data-k="use_env">
      <option value="global"   ${(b.use_env || 'global') === 'global' ? 'selected' : ''}>global（既定）</option>
      <option value="override" ${b.use_env === 'override' ? 'selected' : ''}>override</option>
    </select>
    <label>timeout_ms</label>
    <input data-k="timeout_ms" type="number" value="${escapeAttr(b.timeout_ms ?? '')}">
    <label class="full">ctx_access<span class="field-hint">（カンマ区切り: get, set, emit, log等）</span></label>
    <input class="full" data-k="ctx_access" value="${escapeAttr((b.ctx_access || []).join(', '))}">
  `;

  // --- Tab 5: 実行制御 ---
  const execCtrlEl = document.createElement('div');
  execCtrlEl.className = 'form-grid';
  execCtrlEl.innerHTML = `
    <label>run_if<span class="field-hint">（JSON/MEX）</span></label>
    <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
    <label>on_error</label>
    <select data-k="on_error">
      <option value="">(default: fail)</option>
      <option value="fail"     ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
      <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
      <option value="retry"    ${b.on_error === 'retry' ? 'selected' : ''}>retry</option>
    </select>
    <label class="full">retry<span class="field-hint">（JSON）</span></label>
    <input data-k="retry" class="full" value='${b.retry ? escapeAttr(JSON.stringify(b.retry)) : ''}'>
  `;

  return [
    { id: 'basic', label: '基本設定', element: basicEl },
    { id: 'code', label: 'コード', element: codeEl },
    { id: 'outputs', label: '出力', element: outputsEl },
    { id: 'adv', label: '詳細', element: advEl },
    { id: 'exec', label: '実行制御', element: execCtrlEl },
  ];
}

function readPythonFormInto(b) {
  b.py_name = el('[data-k="py_name"]', editorBody)?.value.trim();
  b.function = el('[data-k="function"]', editorBody)?.value.trim();
  b.inputs = (el('[data-k="inputs"]', editorBody)?.value || '').split(',').map(s => s.trim()).filter(Boolean);

  const funcCode = el('[data-k="function_code"]', editorBody)?.value.trim() || '';
  b.function_code = funcCode || undefined;

  b.code_path = el('[data-k="code_path"]', editorBody)?.value.trim();
  b.venv_path = el('[data-k="venv_path"]', editorBody)?.value.trim();

  const useEnv = el('[data-k="use_env"]', editorBody)?.value || 'global';
  b.use_env = useEnv !== 'global' ? useEnv : undefined;

  const timeoutMs = el('[data-k="timeout_ms"]', editorBody)?.value.trim() || '';
  b.timeout_ms = timeoutMs ? toMaybeNumber(timeoutMs) : undefined;

  const ctxAccess = el('[data-k="ctx_access"]', editorBody)?.value.trim() || '';
  b.ctx_access = ctxAccess ? ctxAccess.split(',').map(s => s.trim()).filter(Boolean) : undefined;

  const outs = [];
  els('#pyOutputs [data-o="py_out"]', editorBody).forEach(inp => {
    const v = inp.value.trim(); if (v) outs.push(v);
  });
  b.py_outputs = outs;

  const runIfStr = el('[data-k="run_if"]', editorBody)?.value.trim() || '';
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  b.on_error = el('[data-k="on_error"]', editorBody)?.value || undefined;

  const retryStr = el('[data-k="retry"]', editorBody)?.value.trim() || '';
  b.retry = retryStr ? safeParseJson(retryStr, null) : undefined;
}

// -------------------------
// END ブロック
// -------------------------
function buildEndTabs(b) {
  // --- Tab 1: 基本設定 ---
  const basicEl = document.createElement('div');
  basicEl.className = 'form-grid';
  basicEl.innerHTML = `
    <label>title<span class="field-hint">（UI表示用）</span></label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec</label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
    <div class="form-divider full"></div>
    <label class="full">reason<span class="field-hint">（任意）</span></label>
    <input class="full" data-k="reason" value="${escapeAttr(b.reason || '')}">
    <label>exit_code</label>
    <input data-k="exit_code" value="${escapeAttr(b.exit_code || 'success')}">
  `;

  // --- Tab 2: 最終出力 ---
  const finalEl = document.createElement('div');
  finalEl.className = 'form-grid';
  finalEl.innerHTML = `
    <fieldset class="inline-list full" id="endFinals">
      <legend class="inline-list-legend">final<span class="field-hint">（最終出力ペイロード）</span></legend>
      <div class="hdr"><div>name</div><div></div><div></div><div>value</div><div>del</div></div>
      ${(b.final || []).map(f => endFinalRow(f)).join('')}
      <button type="button" class="accent btn-add-row" id="btnAddFinal">+ add final</button>
    </fieldset>
  `;
  finalEl.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddFinal') {
      el('#endFinals', finalEl).insertAdjacentHTML('beforeend', endFinalRow({ name: 'Key', value: '' }));
    }
    if (e.target.dataset.act === 'delFinal') e.target.closest('.row').remove();
  });

  // --- Tab 3: 実行制御 ---
  const execCtrlEl = document.createElement('div');
  execCtrlEl.className = 'form-grid';
  execCtrlEl.innerHTML = `
    <label>run_if<span class="field-hint">（JSON）</span></label>
    <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
    <label>on_error</label>
    <select data-k="on_error">
      <option value="">(default: fail)</option>
      <option value="fail"     ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
      <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
    </select>
  `;

  return [
    { id: 'basic', label: '基本設定', element: basicEl },
    { id: 'final', label: '最終出力', element: finalEl },
    { id: 'exec', label: '実行制御', element: execCtrlEl },
  ];
}

function endFinalRow(f) {
  return `
    <div class="row">
      <input placeholder="name"  data-f="name"  value="${escapeAttr(f.name || '')}">
      <div></div><div></div>
      <input placeholder="value" data-f="value" value="${escapeAttr(f.value || '')}">
      <button type="button" class="del" data-act="delFinal" aria-label="Delete final"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
    </div>
  `;
}

function readEndFormInto(b) {
  b.reason = el('[data-k="reason"]', editorBody)?.value || '';
  b.exit_code = el('[data-k="exit_code"]', editorBody)?.value || 'success';

  const finals = [];
  els('#endFinals .row', editorBody).forEach(r => {
    const name = el('[data-f="name"]', r)?.value.trim() || '';
    const value = el('[data-f="value"]', r)?.value || '';
    if (name) finals.push({ name, value });
  });
  b.final = finals;

  const runIfStr = el('[data-k="run_if"]', editorBody)?.value.trim() || '';
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  b.on_error = el('[data-k="on_error"]', editorBody)?.value || undefined;
}

// -------------------------
// Helper
// -------------------------
function allOutputNames() {
  const names = [];
  state.blocks.forEach(b => {
    if (b.type === 'start') (b.outputs || []).forEach(n => { if (n) names.push(n); });
    if (b.type === 'ai') (b.outputs || []).forEach(o => { if (o.name) names.push(o.name); });
    if (b.type === 'logic') (b.outputs || []).forEach(o => { if (o.name) names.push(o.name); });
    if (b.type === 'python') (b.py_outputs || []).forEach(n => { if (n) names.push(n); });
  });
  return names;
}
