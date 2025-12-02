// =========================
// MABEL Studio Frontend (ui.editor: ブロック編集モーダル UI一式)
// - 依存: app.core.js（DOM参照, state, utils）, app.graph.js（inferredInputs, autoAssignExecFromEdges, autolayoutByExec, drawConnections）
// - 提供: openEditor と各種フォームのbuild/read関数
// =========================

// -------------------------
// Editor (Modal)
// -------------------------
function openEditor(b) {
  editorTitle.textContent = `${b.type.toUpperCase()} — ${b.title || b.name || b.py_name || b.id}`;
  editorBody.innerHTML = '';

  els('.node').forEach(n => n.classList.remove('selected'));
  const selNode = el('#node-' + b.id);
  if (selNode) selNode.classList.add('selected');
  selectedBlockId = b.id;

  // Common fields (title & exec)
  const common = document.createElement('div');
  common.className = 'form-grid';
  common.innerHTML = `
    <label>title（UI表示用・YAMLには出力しません）</label>
    <input class="full" data-k="title" value="${escapeAttr(b.title || '')}">
    <label>exec</label>
    <input data-k="exec" type="number" min="1" value="${escapeAttr(b.exec ?? 1)}">
  `;
  editorBody.appendChild(common);

  if (b.type === 'start') editorBody.appendChild(buildStartForm(b));
  if (b.type === 'ai') editorBody.appendChild(buildAiForm(b));
  if (b.type === 'logic') editorBody.appendChild(buildLogicForm(b));
  if (b.type === 'python') editorBody.appendChild(buildPythonForm(b));
  if (b.type === 'end') editorBody.appendChild(buildEndForm(b));

  const detected = inferredInputs(b);
  const info = document.createElement('div');
  info.innerHTML = `
    <p class="small-note">Detected inputs from <span class="kbd">{...}</span>: ${detected.map(x => `<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</p>
  `;
  editorBody.appendChild(info);

  editorForm.onsubmit = (ev) => {
    ev.preventDefault();
    const t = el('[data-k="title"]', editorBody).value.trim();
    const ex = Number(el('[data-k="exec"]', editorBody).value) || 1;
    b.title = t; b.exec = ex;

    if (b.type === 'start') readStartFormInto(b);
    if (b.type === 'ai') readAiFormInto(b);
    if (b.type === 'logic') readLogicFormInto(b);
    if (b.type === 'python') readPythonFormInto(b);
    if (b.type === 'end') readEndFormInto(b);

    // 保存時はレイアウトを変更しない（位置維持）
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

function buildStartForm(b) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.innerHTML = `
    <div class="full">
      <p class="small-note">STARTブロックは入力を持たず、固定の出力「UserInput」を提供します。YAMLには出力されません。</p>
    </div>
  `;
  return wrap;
}

function readStartFormInto(b) {
  // startブロックは出力が固定なので、特に読み取る必要はない
  // 念のため配列を維持
  b.outputs = ['UserInput'];
}

function buildAiForm(b) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.innerHTML = `
    <label>model</label>
    <select data-k="model">${state.models.map(m => `
      <option value="${escapeAttr(m.name)}" ${m.name === b.model ? 'selected' : ''}>${escapeHtml(m.name)}</option>
    `).join('')}</select>

    <label class="full">system_prompt</label>
    <textarea class="full" rows="4" data-k="system_prompt">${escapeHtml(b.system_prompt || '')}</textarea>

    <label class="full">prompts（複数行：各要素を---で区切り）</label>
    <textarea class="full" rows="5" data-k="prompts">${escapeHtml((b.prompts || ['']).join('\n---\n'))}</textarea>

    <details class="full"><summary>mode（v2: text/json）</summary>
      <div class="form-grid">
        <label>mode</label>
        <select data-k="mode">
          <option value="text" ${(b.mode || 'text') === 'text' ? 'selected' : ''}>text</option>
          <option value="json" ${b.mode === 'json' ? 'selected' : ''}>json</option>
        </select>
      </div>
    </details>

    <details class="full" open><summary>outputs（必須）</summary>
      <fieldset class="inline-list" id="aiOutputs">
        <div class="hdr"><div>name</div><div>select</div><div>tag/path</div><div>regex</div><div>type_hint</div><div>del</div></div>
        <div class="small-note">name / select(full/tag/regex/jsonpath) / tag or path / regex / type_hint / join_with</div>
        ${(b.outputs || []).map((o, i) => aiOutputRow(o, i)).join('')}
        <button type="button" class="accent" id="btnAddOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>save_to（v2: 出力をグローバル変数に保存）</summary>
      <div class="form-grid">
        <label class="full">変数名: 出力名（例: memo: Answer）</label>
        <textarea class="full" rows="2" data-k="save_to_vars" placeholder="memo: Answer">${b.save_to?.vars ? Object.entries(b.save_to.vars).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
    }</textarea>
      </div>
    </details>

    <details class="full"><summary>params（任意・モデルdefaultsを上書き）</summary>
      <div class="form-grid">
        ${['temperature', 'top_p', 'max_tokens'].map(k => `
          <label>${k}</label><input data-param="${k}" value="${b.params?.[k] ?? ''}">
        `).join('')}
        <label>stop（カンマ区切り）</label><input data-param="stop" value="${(b.params?.stop || []).join(',')}">
      </div>
    </details>

    <details class="full"><summary>run_if / on_error / retry（任意）</summary>
      <div class="form-grid">
        <label>run_if（JSON/MEX: 例 {"equals":["{Flag}","on"]}）</label>
        <input data-k="run_if" class="full" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
        <label>on_error</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
          <option value="retry" ${b.on_error === 'retry' ? 'selected' : ''}>retry</option>
        </select>
        <label class="full">retry（JSON: {"max_attempts":2, "backoff":{"type":"exponential","base_ms":500}}）</label>
        <input data-k="retry" class="full" value='${b.retry ? escapeAttr(JSON.stringify(b.retry)) : ''}'>
      </div>
    </details>

    <details class="full"><summary>budget（v2: ブロック局所予算）</summary>
      <div class="form-grid">
        <label class="full">budget（JSON: {"ai":{"max_calls":5}}）</label>
        <input data-k="budget" class="full" value='${b.budget ? escapeAttr(JSON.stringify(b.budget)) : ''}'>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddOut') {
      const fieldset = el('#aiOutputs', wrap);
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

  return wrap;
}

function aiOutputRow(o, i) {
  return `
    <div class="row">
      <input placeholder="name" data-o="name" value="${escapeAttr(o.name || '')}">
      <select data-o="select">
        <option value="full" ${(o.select || 'full') === 'full' ? 'selected' : ''}>full</option>
        <option value="tag" ${o.select === 'tag' ? 'selected' : ''}>tag</option>
        <option value="regex" ${o.select === 'regex' ? 'selected' : ''}>regex</option>
        <option value="jsonpath" ${o.select === 'jsonpath' ? 'selected' : ''}>jsonpath</option>
      </select>
      <input placeholder="tag/path" data-o="tag_or_path" value="${escapeAttr(o.tag || o.path || '')}">
      <input placeholder="regex" data-o="regex" value="${escapeAttr(o.regex || '')}">
      <input placeholder="type_hint" data-o="type_hint" value="${escapeAttr(o.type_hint || '')}">
      <button type="button" class="del" data-act="delOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
    </div>
    <div class="row">
      <input class="full" placeholder="join_with（select=tag時の複数結合）" data-o="join_with" value="${escapeAttr(o.join_with || '')}">
    </div>
  `;
}

function readAiFormInto(b) {
  b.model = el('[data-k="model"]', editorBody).value.trim();
  b.system_prompt = el('[data-k="system_prompt"]', editorBody).value;
  b.prompts = el('[data-k="prompts"]', editorBody).value.split(/\n---\n/g);

  // mode (v2)
  const mode = el('[data-k="mode"]', editorBody)?.value || 'text';
  b.mode = mode;

  // outputs
  const outRows = els('#aiOutputs .row', editorBody);
  const outputs = [];
  for (let i = 0; i < outRows.length; i += 2) {
    const rMain = outRows[i];
    const rJoin = outRows[i + 1];
    if (!rMain) continue;
    const name = el('[data-o="name"]', rMain).value.trim();
    const select = el('[data-o="select"]', rMain).value || 'full';
    const tagOrPath = el('[data-o="tag_or_path"]', rMain).value.trim();
    const regex = el('[data-o="regex"]', rMain).value.trim();
    const typeHint = el('[data-o="type_hint"]', rMain).value.trim();
    const joinWith = rJoin ? (el('[data-o="join_with"]', rJoin).value) : '';

    if (!name) continue;

    const o = { name, select };

    // selectに応じてtag/path/regexを設定
    if (select === 'tag' && tagOrPath) o.tag = tagOrPath;
    if (select === 'jsonpath' && tagOrPath) o.path = tagOrPath;
    if (select === 'regex' && regex) o.regex = regex;
    if (joinWith) o.join_with = joinWith;
    if (typeHint) o.type_hint = typeHint;

    outputs.push(o);
  }
  b.outputs = outputs;

  // save_to (v2)
  const saveToVarsText = el('[data-k="save_to_vars"]', editorBody)?.value.trim() || '';
  if (saveToVarsText) {
    const vars = {};
    saveToVarsText.split('\n').forEach(line => {
      const match = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
      if (match) vars[match[1]] = match[2];
    });
    if (Object.keys(vars).length > 0) {
      b.save_to = { vars };
    } else {
      b.save_to = undefined;
    }
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

  // run_if
  const runIfStr = el('[data-k="run_if"]', editorBody).value.trim();
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;

  // on_error
  const oe = el('[data-k="on_error"]', editorBody).value;
  b.on_error = oe || undefined;

  // retry (v2)
  const retryStr = el('[data-k="retry"]', editorBody)?.value.trim() || '';
  b.retry = retryStr ? safeParseJson(retryStr, null) : undefined;

  // budget (v2)
  const budgetStr = el('[data-k="budget"]', editorBody)?.value.trim() || '';
  b.budget = budgetStr ? safeParseJson(budgetStr, null) : undefined;
}

function buildLogicForm(b) {
  const currentOp = b.op || 'if';
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';

  // opタイプごとに表示するセクションを決定
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
    recurse: ['recurse_section']
  };

  // outputsのfrom選択肢もopタイプごとに最適化
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
    recurse: ['value']
  };

  wrap.innerHTML = `
    <label>name（任意）</label>
    <input data-k="name" value="${escapeAttr(b.name || '')}">

    <label>op</label>
    <select data-k="op" id="logicOpSelect">
      <option value="if" ${currentOp === 'if' ? 'selected' : ''}>if</option>
      <option value="and" ${currentOp === 'and' ? 'selected' : ''}>and</option>
      <option value="or" ${currentOp === 'or' ? 'selected' : ''}>or</option>
      <option value="not" ${currentOp === 'not' ? 'selected' : ''}>not</option>
      <option value="for" ${currentOp === 'for' ? 'selected' : ''}>for</option>
      <option value="while" ${currentOp === 'while' ? 'selected' : ''}>while (v2)</option>
      <option value="set" ${currentOp === 'set' ? 'selected' : ''}>set (v2)</option>
      <option value="let" ${currentOp === 'let' ? 'selected' : ''}>let (v2)</option>
      <option value="reduce" ${currentOp === 'reduce' ? 'selected' : ''}>reduce (v2)</option>
      <option value="call" ${currentOp === 'call' ? 'selected' : ''}>call (v2)</option>
      <option value="emit" ${currentOp === 'emit' ? 'selected' : ''}>emit (v2)</option>
      <option value="recurse" ${currentOp === 'recurse' ? 'selected' : ''}>recurse (v2)</option>
    </select>

    <div id="logicOpSections" class="full">
      <!-- if セクション -->
      <div class="form-grid logic-section" data-section="if_section" style="display: ${currentOp === 'if' ? 'grid' : 'none'};">
        <h4 class="full">条件・分岐設定</h4>
        <label class="full">cond（JSON: 条件式）</label>
        <input class="full" data-k="cond" value='${escapeAttr(JSON.stringify(b.cond || {}))}'>
        <label>then（条件成立時）</label>
        <input data-k="then" value="${escapeAttr(b.then || '')}" placeholder="run / skip / exec番号">
        <label>else（条件不成立時）</label>
        <input data-k="else" value="${escapeAttr(b.else || '')}" placeholder="run / skip / exec番号">
      </div>

      <!-- operands セクション (and/or/not) -->
      <div class="form-grid logic-section" data-section="operands_section" style="display: ${['and', 'or', 'not'].includes(currentOp) ? 'grid' : 'none'};">
        <h4 class="full">${currentOp === 'not' ? '否定対象' : '論理演算対象'}</h4>
        <label class="full">operands（JSON配列: ${currentOp === 'not' ? '1つの条件' : '複数の条件'}）</label>
        <textarea class="full" rows="4" data-k="operands" placeholder='[{"equals": ["{Var}", "value"]}${currentOp !== 'not' ? ', {"gt": ["{Count}", 0]}' : ''}]'>${b.operands ? escapeHtml(JSON.stringify(b.operands, null, 2)) : ''}</textarea>
      </div>

      <!-- for セクション -->
      <div class="form-grid logic-section" data-section="for_section" style="display: ${currentOp === 'for' ? 'grid' : 'none'};">
        <h4 class="full">ループ設定</h4>
        <label>list（リストソース）</label>
        <input class="full" data-k="list" value="${escapeAttr(b.list || '')}" placeholder="{Items}">
        <label>parse（パース方式）</label>
        <select data-k="parse">
          <option value="">(default: lines)</option>
          <option value="lines" ${b.parse === 'lines' ? 'selected' : ''}>lines</option>
          <option value="csv" ${b.parse === 'csv' ? 'selected' : ''}>csv</option>
          <option value="json" ${b.parse === 'json' ? 'selected' : ''}>json</option>
          <option value="regex" ${b.parse === 'regex' ? 'selected' : ''}>regex</option>
        </select>
        <label>regex_pattern（parse=regex時）</label>
        <input data-k="regex_pattern" class="full" value="${escapeAttr(b.regex_pattern || '')}" placeholder="正規表現パターン">
        <label>var（ループ変数名）</label>
        <input data-k="var" value="${escapeAttr(b.var || '')}" placeholder="item（既定）">
        <label>drop_empty（空要素を除外）</label>
        <select data-k="drop_empty">
          <option value="">(default: true)</option>
          <option value="true" ${b.drop_empty === true ? 'selected' : ''}>true</option>
          <option value="false" ${b.drop_empty === false ? 'selected' : ''}>false</option>
        </select>
        <label class="full">where（フィルタ条件, JSON）</label>
        <input data-k="where" class="full" value='${b.where ? escapeAttr(JSON.stringify(b.where)) : ''}' placeholder='{"gt": ["{item.length}", 0]}'>
        <label class="full">map（変換テンプレート）</label>
        <input data-k="map" class="full" value="${escapeAttr(b.map || '')}" placeholder="{item}を加工">
      </div>

      <!-- set セクション -->
      <div class="form-grid logic-section" data-section="set_section" style="display: ${currentOp === 'set' ? 'grid' : 'none'};">
        <h4 class="full">変数設定</h4>
        <label>var（変数名）</label>
        <input class="full" data-k="set_var" value="${escapeAttr(b.var || '')}" placeholder="MyVariable">
        <label class="full">value（設定する値, JSON/MEX式）</label>
        <textarea class="full" rows="3" data-k="set_value" placeholder="{SomeValue} または JSON">${escapeHtml(typeof b.value === 'object' ? JSON.stringify(b.value, null, 2) : (b.value || ''))}</textarea>
      </div>

      <!-- let セクション -->
      <div class="form-grid logic-section" data-section="let_section" style="display: ${currentOp === 'let' ? 'grid' : 'none'};">
        <h4 class="full">ローカルスコープ設定</h4>
        <label class="full">bindings（JSON: ローカル変数束縛）</label>
        <textarea class="full" rows="3" data-k="let_bindings" placeholder='{"x": "{Input}", "y": 10}'>${escapeHtml(b.bindings ? JSON.stringify(b.bindings, null, 2) : '')}</textarea>
        <label class="full">body（JSON: 実行式）</label>
        <textarea class="full" rows="5" data-k="let_body" placeholder='{"add": ["{x}", "{y}"]}'>${escapeHtml(b.body ? JSON.stringify(b.body, null, 2) : '')}</textarea>
      </div>

      <!-- reduce セクション -->
      <div class="form-grid logic-section" data-section="reduce_section" style="display: ${currentOp === 'reduce' ? 'grid' : 'none'};">
        <h4 class="full">累積処理設定</h4>
        <label>list（リストソース）</label>
        <input class="full" data-k="reduce_list" value="${escapeAttr(b.list || '')}" placeholder="{Items}">
        <label>value（初期値）</label>
        <input class="full" data-k="reduce_value" value="${escapeAttr(typeof b.value === 'object' ? JSON.stringify(b.value) : (b.value ?? ''))}" placeholder="0 または JSON">
        <label>var（アイテム変数名）</label>
        <input data-k="reduce_var" value="${escapeAttr(b.var || '')}" placeholder="item（既定）">
        <label>accumulator（累積変数名）</label>
        <input data-k="reduce_accumulator" value="${escapeAttr(b.accumulator || '')}" placeholder="acc（既定）">
        <label class="full">body（JSON: 累積ロジック）</label>
        <textarea class="full" rows="5" data-k="reduce_body" placeholder='{"add": ["{acc}", 1]}'>${escapeHtml(b.body ? JSON.stringify(b.body, null, 2) : '')}</textarea>
      </div>

      <!-- while セクション -->
      <div class="form-grid logic-section" data-section="while_section" style="display: ${currentOp === 'while' ? 'grid' : 'none'};">
        <h4 class="full">Whileループ設定</h4>
        <label class="full">init（JSON: 初期化）</label>
        <textarea class="full" rows="3" data-k="while_init" placeholder='{"counter": 0}'>${escapeHtml(b.init ? JSON.stringify(b.init, null, 2) : '')}</textarea>
        <label class="full">cond（JSON: ループ継続条件）</label>
        <textarea class="full" rows="2" data-k="while_cond" placeholder='{"lt": ["{counter}", 10]}'>${escapeHtml(b.cond ? JSON.stringify(b.cond, null, 2) : '')}</textarea>
        <label class="full">step（JSON: ループ本体）</label>
        <textarea class="full" rows="5" data-k="while_step" placeholder='{"set": {"counter": {"add": ["{counter}", 1]}}}'>${escapeHtml(b.step ? JSON.stringify(b.step, null, 2) : '')}</textarea>
        <label class="full">budget（JSON: ループ予算制限）</label>
        <input class="full" data-k="while_budget" value='${b.budget ? escapeAttr(JSON.stringify(b.budget)) : ''}' placeholder='{"max_iters": 100}'>
      </div>

      <!-- call セクション -->
      <div class="form-grid logic-section" data-section="call_section" style="display: ${currentOp === 'call' ? 'grid' : 'none'};">
        <h4 class="full">関数呼び出し設定</h4>
        <label>function（関数名）</label>
        <input class="full" data-k="call_function" value="${escapeAttr(typeof b.function === 'string' ? b.function : '')}" placeholder="myFunction">
        <label class="full">with（JSON: 引数マッピング）</label>
        <textarea class="full" rows="3" data-k="call_with" placeholder='{"arg1": "{Input1}"}'>${escapeHtml(b.with ? JSON.stringify(b.with, null, 2) : '')}</textarea>
        <label class="full">returns（戻り値変数名, カンマ区切り）</label>
        <input class="full" data-k="call_returns" value="${escapeAttr((b.returns || []).join(', '))}" placeholder="result, status">
      </div>

      <!-- emit セクション -->
      <div class="form-grid logic-section" data-section="emit_section" style="display: ${currentOp === 'emit' ? 'grid' : 'none'};">
        <h4 class="full">値発行設定</h4>
        <label class="full">value（発行する値, JSON/MEX式）</label>
        <textarea class="full" rows="3" data-k="emit_value" placeholder="{OutputValue} または JSON">${escapeHtml(typeof b.value === 'object' ? JSON.stringify(b.value, null, 2) : (b.value || ''))}</textarea>
        <p class="small-note full">emitブロックは値を発行するため、通常outputsは不要です。</p>
      </div>

      <!-- recurse セクション -->
      <div class="form-grid logic-section" data-section="recurse_section" style="display: ${currentOp === 'recurse' ? 'grid' : 'none'};">
        <h4 class="full">再帰処理設定</h4>
        <label class="full">function（JSON: 再帰関数定義 {args, returns, base_case, body}）</label>
        <textarea class="full" rows="10" data-k="recurse_function" placeholder='{"args": ["n"], "returns": ["result"], "base_case": {"if": {"lte": ["{n}", 1]}, "then": 1}, "body": {...}}'>${escapeHtml(typeof b.function === 'object' ? JSON.stringify(b.function, null, 2) : '')}</textarea>
        <label class="full">with（JSON: 初期呼び出し引数）</label>
        <textarea class="full" rows="3" data-k="recurse_with" placeholder='{"n": 10}'>${escapeHtml(b.with ? JSON.stringify(b.with, null, 2) : '')}</textarea>
        <label class="full">budget（JSON: 再帰深度制限）</label>
        <input class="full" data-k="recurse_budget" value='${b.budget ? escapeAttr(JSON.stringify(b.budget)) : ''}' placeholder='{"max_depth": 10}'>
      </div>
    </div>

    <details class="full" id="logicOutputsSection" open style="display: ${currentOp === 'emit' ? 'none' : 'block'};">
      <summary>outputs（任意）</summary>
      <fieldset class="inline-list" id="logicOutputs">
        <div class="hdr"><div>name</div><div>from</div><div>source</div><div>join_with</div><div>del</div></div>
        <div class="small-note" id="logicOutputsHint">name / from / source(raw|filtered|mapped) / join_with</div>
        ${(b.outputs || []).map(o => logicOutputRow(o, currentOp)).join('')}
        <button type="button" class="accent" id="btnAddLogicOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>run_if / on_error（任意）</summary>
      <div class="form-grid">
        <label class="full">run_if（JSON: 実行条件）</label>
        <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}' placeholder='{"equals": ["{Flag}", "on"]}'>
        <label>on_error（エラー時動作）</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
        </select>
      </div>
    </details>
  `;

  // opタイプ変更時のセクション切り替え
  const opSelect = wrap.querySelector('#logicOpSelect');
  opSelect.addEventListener('change', (e) => {
    const newOp = e.target.value;
    const sections = wrap.querySelectorAll('.logic-section');
    const sectionsToShow = opSections[newOp] || [];

    sections.forEach(sec => {
      const sectionName = sec.dataset.section;
      sec.style.display = sectionsToShow.includes(sectionName) ? 'grid' : 'none';
    });

    // emitの場合はoutputsセクションを非表示
    const outputsSection = wrap.querySelector('#logicOutputsSection');
    if (outputsSection) {
      outputsSection.style.display = newOp === 'emit' ? 'none' : 'block';
    }

    // operandsセクションのタイトルを更新
    const operandsSection = wrap.querySelector('[data-section="operands_section"] h4');
    if (operandsSection) {
      operandsSection.textContent = newOp === 'not' ? '否定対象' : '論理演算対象';
    }
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddLogicOut') {
      const fs = el('#logicOutputs', wrap);
      const currentOp = wrap.querySelector('#logicOpSelect').value;
      const defaultFrom = (opOutputFromOptions[currentOp] || ['boolean'])[0] || 'boolean';
      fs.insertAdjacentHTML('beforeend', logicOutputRow({ name: 'Out_' + Math.random().toString(36).slice(2, 6), from: defaultFrom }, currentOp));
    }
    if (e.target.dataset.act === 'delOut') {
      const row = e.target.closest('.row');
      const next = row?.nextElementSibling;
      if (next && (next.querySelector('[data-o="test"]') || next.querySelector('[data-o="limit"]') || next.querySelector('[data-o="offset"]'))) next.remove();
      row.remove();
    }
  });

  return wrap;
}

function logicOutputRow(o, opType = 'if') {
  // opタイプごとに利用可能なfromオプション
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
    recurse: ['value']
  };

  const availableFromOptions = opOutputFromOptions[opType] || ['boolean', 'value'];

  // fromオプションの表示名
  const fromLabels = {
    boolean: 'boolean（真偽値）',
    value: 'value（計算結果）',
    join: 'join（結合文字列）',
    count: 'count（件数）',
    list: 'list（リスト）',
    any: 'any（いずれか）',
    all: 'all（すべて）',
    first: 'first（最初の要素）',
    last: 'last（最後の要素）'
  };

  // forループ用の追加フィールド（source, test, limit, offset）を表示するか
  const showForFields = opType === 'for';
  // joinオプションが選択可能な場合のみjoin_withを表示
  const showJoinWith = availableFromOptions.includes('join') || o.from === 'join';

  let html = `
    <div class="row">
      <input placeholder="name" data-o="name" value="${escapeAttr(o.name || '')}">
      <select data-o="from">
        ${availableFromOptions.map(opt =>
    `<option value="${opt}" ${o.from === opt ? 'selected' : ''}>${fromLabels[opt] || opt}</option>`
  ).join('')}
      </select>
      ${showForFields ? `
        <select data-o="source">
          <option value="" ${!o.source ? 'selected' : ''}>(default)</option>
          <option value="raw" ${o.source === 'raw' ? 'selected' : ''}>raw</option>
          <option value="filtered" ${o.source === 'filtered' ? 'selected' : ''}>filtered</option>
          <option value="mapped" ${o.source === 'mapped' ? 'selected' : ''}>mapped</option>
        </select>
      ` : '<div></div>'}
      ${showJoinWith ? `
        <input placeholder="join_with" data-o="join_with" value="${escapeAttr(o.join_with || '')}">
      ` : '<div></div>'}
      <button type="button" class="del" data-act="delOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
    </div>`;

  // forループの場合のみ追加行を表示
  if (showForFields) {
    html += `
    <div class="row">
      <input placeholder='test（JSON, any/all用）' data-o="test" value='${o.test ? escapeAttr(JSON.stringify(o.test)) : ''}'>
      <input placeholder="limit" data-o="limit" value="${o.limit ?? ''}">
      <input placeholder="offset" data-o="offset" value="${o.offset ?? ''}">
      <div></div>
      <div></div>
    </div>`;
  }

  return html;
}

function readLogicFormInto(b) {
  b.name = el('[data-k="name"]', editorBody).value.trim() || undefined;
  const newOp = el('[data-k="op"]', editorBody).value;
  b.op = newOp;

  // 最初に全ての可能なプロパティをリセット（opタイプが変わった場合のクリーンアップ）
  const allOpProps = ['cond', 'then', 'else', 'operands', 'list', 'parse', 'regex_pattern',
    'var', 'drop_empty', 'where', 'map', 'value', 'bindings', 'body', 'accumulator',
    'init', 'step', 'budget', 'function', 'with', 'returns'];

  // opに関係ないプロパティを削除する代わりに、選択されたopに必要なものだけを設定

  switch (newOp) {
    case 'if': {
      // if演算子用フィールドのみ読み取り
      const condStr = el('[data-k="cond"]', editorBody)?.value.trim() || '';
      b.cond = condStr ? safeParseJson(condStr, {}) : undefined;
      b.then = el('[data-k="then"]', editorBody)?.value || undefined;
      b.else = el('[data-k="else"]', editorBody)?.value || undefined;
      // 不要なプロパティを削除
      delete b.operands; delete b.list; delete b.parse; delete b.regex_pattern;
      delete b.var; delete b.drop_empty; delete b.where; delete b.map;
      delete b.value; delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget; delete b.function;
      delete b.with; delete b.returns;
      break;
    }

    case 'and':
    case 'or':
    case 'not': {
      // and/or/not演算子用フィールド
      const opsStr = el('[data-k="operands"]', editorBody)?.value.trim() || '';
      b.operands = opsStr ? safeParseJson(opsStr, []) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else;
      delete b.list; delete b.parse; delete b.regex_pattern;
      delete b.var; delete b.drop_empty; delete b.where; delete b.map;
      delete b.value; delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget; delete b.function;
      delete b.with; delete b.returns;
      break;
    }

    case 'for': {
      // for演算子用フィールド
      b.list = el('[data-k="list"]', editorBody)?.value || undefined;
      b.parse = el('[data-k="parse"]', editorBody)?.value || undefined;
      b.regex_pattern = el('[data-k="regex_pattern"]', editorBody)?.value || undefined;
      b.var = el('[data-k="var"]', editorBody)?.value.trim() || undefined;
      const dropSel = el('[data-k="drop_empty"]', editorBody)?.value || '';
      b.drop_empty = dropSel === '' ? undefined : (dropSel === 'true');
      const whereStr = el('[data-k="where"]', editorBody)?.value.trim() || '';
      b.where = whereStr ? safeParseJson(whereStr, null) : undefined;
      b.map = el('[data-k="map"]', editorBody)?.value || undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.value; delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget; delete b.function;
      delete b.with; delete b.returns;
      break;
    }

    case 'set': {
      // set演算子用フィールド
      b.var = el('[data-k="set_var"]', editorBody)?.value.trim() || undefined;
      const setValueStr = el('[data-k="set_value"]', editorBody)?.value.trim() || '';
      b.value = setValueStr ? safeParseJson(setValueStr, setValueStr) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.drop_empty;
      delete b.where; delete b.map; delete b.bindings; delete b.body;
      delete b.accumulator; delete b.init; delete b.step; delete b.budget;
      delete b.function; delete b.with; delete b.returns;
      break;
    }

    case 'let': {
      // let演算子用フィールド
      const bindingsStr = el('[data-k="let_bindings"]', editorBody)?.value.trim() || '';
      b.bindings = bindingsStr ? safeParseJson(bindingsStr, {}) : undefined;
      const bodyStr = el('[data-k="let_body"]', editorBody)?.value.trim() || '';
      b.body = bodyStr ? safeParseJson(bodyStr, {}) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.accumulator; delete b.init; delete b.step; delete b.budget;
      delete b.function; delete b.with; delete b.returns;
      break;
    }

    case 'reduce': {
      // reduce演算子用フィールド
      b.list = el('[data-k="reduce_list"]', editorBody)?.value.trim() || undefined;
      const valueStr = el('[data-k="reduce_value"]', editorBody)?.value.trim() || '';
      b.value = valueStr ? safeParseJson(valueStr, valueStr) : undefined;
      b.var = el('[data-k="reduce_var"]', editorBody)?.value.trim() || undefined;
      b.accumulator = el('[data-k="reduce_accumulator"]', editorBody)?.value.trim() || undefined;
      const bodyStr = el('[data-k="reduce_body"]', editorBody)?.value.trim() || '';
      b.body = bodyStr ? safeParseJson(bodyStr, {}) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.parse; delete b.regex_pattern; delete b.drop_empty; delete b.where;
      delete b.map; delete b.bindings; delete b.init; delete b.step;
      delete b.budget; delete b.function; delete b.with; delete b.returns;
      break;
    }

    case 'while': {
      // while演算子用フィールド
      const initStr = el('[data-k="while_init"]', editorBody)?.value.trim() || '';
      b.init = initStr ? safeParseJson(initStr, {}) : undefined;
      const condStr = el('[data-k="while_cond"]', editorBody)?.value.trim() || '';
      b.cond = condStr ? safeParseJson(condStr, {}) : undefined;
      const stepStr = el('[data-k="while_step"]', editorBody)?.value.trim() || '';
      b.step = stepStr ? safeParseJson(stepStr, {}) : undefined;
      const budgetStr = el('[data-k="while_budget"]', editorBody)?.value.trim() || '';
      b.budget = budgetStr ? safeParseJson(budgetStr, null) : undefined;
      // 不要なプロパティを削除
      delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.bindings; delete b.body; delete b.accumulator;
      delete b.function; delete b.with; delete b.returns;
      break;
    }

    case 'call': {
      // call演算子用フィールド
      b.function = el('[data-k="call_function"]', editorBody)?.value.trim() || undefined;
      const withStr = el('[data-k="call_with"]', editorBody)?.value.trim() || '';
      b.with = withStr ? safeParseJson(withStr, {}) : undefined;
      const returnsStr = el('[data-k="call_returns"]', editorBody)?.value.trim() || '';
      b.returns = returnsStr ? returnsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.budget;
      break;
    }

    case 'emit': {
      // emit演算子用フィールド
      const valueStr = el('[data-k="emit_value"]', editorBody)?.value.trim() || '';
      b.value = valueStr ? safeParseJson(valueStr, valueStr) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.bindings;
      delete b.body; delete b.accumulator; delete b.init; delete b.step;
      delete b.budget; delete b.function; delete b.with; delete b.returns;
      // emitの場合はoutputsを空にする
      b.outputs = [];
      break;
    }

    case 'recurse': {
      // recurse演算子用フィールド
      const recurseNameVal = el('[data-k="recurse_name"]', editorBody)?.value.trim() || '';
      if (recurseNameVal) b.name = recurseNameVal;
      const funcStr = el('[data-k="recurse_function"]', editorBody)?.value.trim() || '';
      b.function = funcStr ? safeParseJson(funcStr, {}) : undefined;
      const withStr = el('[data-k="recurse_with"]', editorBody)?.value.trim() || '';
      b.with = withStr ? safeParseJson(withStr, {}) : undefined;
      const budgetStr = el('[data-k="recurse_budget"]', editorBody)?.value.trim() || '';
      b.budget = budgetStr ? safeParseJson(budgetStr, null) : undefined;
      // 不要なプロパティを削除
      delete b.cond; delete b.then; delete b.else; delete b.operands;
      delete b.list; delete b.parse; delete b.regex_pattern; delete b.var;
      delete b.drop_empty; delete b.where; delete b.map; delete b.value;
      delete b.bindings; delete b.body; delete b.accumulator;
      delete b.init; delete b.step; delete b.returns;
      break;
    }
  }

  // outputs（emit以外）
  if (newOp !== 'emit') {
    const rows = els('#logicOutputs .row', editorBody);
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

      // forの場合のみ2行目をチェック
      if (newOp === 'for' && i + 1 < rows.length) {
        const r2 = rows[i + 1];
        const testEl = el('[data-o="test"]', r2);
        if (testEl) {
          const testStr = testEl.value.trim();
          const limitStr = el('[data-o="limit"]', r2)?.value.trim() || '';
          const offsetStr = el('[data-o="offset"]', r2)?.value.trim() || '';

          if (testStr) {
            const parsed = safeParseJson(testStr, null);
            if (parsed !== null) o.test = parsed;
          }
          if (limitStr !== '') o.limit = toMaybeNumber(limitStr);
          if (offsetStr !== '') o.offset = toMaybeNumber(offsetStr);
          i += 2;
          outs.push(o);
          continue;
        }
      }

      i++;
      outs.push(o);
    }
    b.outputs = outs;
  }

  // 共通オプション
  const runIfStr = el('[data-k="run_if"]', editorBody)?.value.trim() || '';
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : undefined;
  const oe = el('[data-k="on_error"]', editorBody)?.value || '';
  b.on_error = oe || undefined;
}

function buildPythonForm(b) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.innerHTML = `
    <label>name（必須）</label>
    <input data-k="py_name" value="${escapeAttr(b.py_name || '')}">
    <label>function/entrypoint（必須）</label>
    <input data-k="function" value="${escapeAttr(b.function || b.entrypoint || '')}">

    <label>inputs（複数可・候補から選択/自由入力）</label>
    <input class="full" data-k="inputs" placeholder="例: Answer, Plan" value="${escapeAttr((b.inputs || []).join(', '))}">
    <div class="small-note full">利用可能な出力: ${allOutputNames().map(x => `<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</div>

    <details class="full"><summary>function_code（v2: インライン関数）</summary>
      <div class="form-grid">
        <label class="full">Pythonコード（空の場合はcode_pathを使用）</label>
        <textarea class="full" rows="8" data-k="function_code" placeholder="def main(ctx, **inputs):\n    return {'Output': value}">${escapeHtml(b.function_code || '')}</textarea>
      </div>
    </details>

    <details class="full"><summary>code_path / venv_path（v1互換）</summary>
      <div class="form-grid">
        <label>code_path</label>
        <input class="full" data-k="code_path" value="${escapeAttr(b.code_path || '')}">
        <label>venv_path（非推奨: runtime.pythonを使用推奨）</label>
        <input class="full" data-k="venv_path" value="${escapeAttr(b.venv_path || '')}">
      </div>
    </details>

    <details class="full"><summary>v2拡張設定</summary>
      <div class="form-grid">
        <label>use_env</label>
        <select data-k="use_env">
          <option value="global" ${(b.use_env || 'global') === 'global' ? 'selected' : ''}>global（既定）</option>
          <option value="override" ${b.use_env === 'override' ? 'selected' : ''}>override</option>
        </select>
        <label class="full">timeout_ms</label>
        <input data-k="timeout_ms" type="number" value="${b.timeout_ms ?? ''}">
        <label class="full">ctx_access（カンマ区切り: get, set, emit, log等）</label>
        <input class="full" data-k="ctx_access" value="${(b.ctx_access || []).join(', ')}">
      </div>
    </details>

    <details class="full"><summary>outputs（必須）</summary>
      <fieldset class="inline-list" id="pyOutputs">
        ${(b.py_outputs || []).map(o => `
          <div class="row python">
            <input placeholder="output name" data-o="py_out" value="${escapeAttr(o)}">
            <div></div>
            <button type="button" class="del" data-act="delPyOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
          </div>
        `).join('')}
        <button type="button" class="accent" id="btnAddPyOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>run_if / on_error / retry（任意）</summary>
      <div class="form-grid">
        <label>run_if（JSON/MEX）</label>
        <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
        <label>on_error</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
          <option value="retry" ${b.on_error === 'retry' ? 'selected' : ''}>retry</option>
        </select>
        <label class="full">retry（JSON）</label>
        <input data-k="retry" class="full" value='${b.retry ? escapeAttr(JSON.stringify(b.retry)) : ''}'>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddPyOut') {
      const fs = el('#pyOutputs', wrap);
      fs.insertAdjacentHTML('beforeend', `
        <div class="row python">
          <input placeholder="output name" data-o="py_out">
          <div></div>
          <button type="button" class="del" data-act="delPyOut" aria-label="Delete output"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
        </div>
      `);
    }
    if (e.target.dataset.act === 'delPyOut') e.target.closest('.row').remove();
  });

  return wrap;
}

function readPythonFormInto(b) {
  b.py_name = el('[data-k="py_name"]', editorBody).value.trim();
  b.function = el('[data-k="function"]', editorBody).value.trim();
  b.inputs = el('[data-k="inputs"]', editorBody).value.split(',').map(s => s.trim()).filter(Boolean);

  // function_code (v2)
  const funcCode = el('[data-k="function_code"]', editorBody)?.value.trim() || '';
  b.function_code = funcCode || undefined;

  b.code_path = el('[data-k="code_path"]', editorBody).value.trim();
  b.venv_path = el('[data-k="venv_path"]', editorBody).value.trim();

  // v2拡張設定
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

  const runIfStr = el('[data-k="run_if"]', editorBody).value.trim();
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  const oe = el('[data-k="on_error"]', editorBody).value;
  b.on_error = oe || undefined;

  // retry (v2)
  const retryStr = el('[data-k="retry"]', editorBody)?.value.trim() || '';
  b.retry = retryStr ? safeParseJson(retryStr, null) : undefined;
}

function buildEndForm(b) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.innerHTML = `
    <label class="full">reason（任意）</label>
    <input class="full" data-k="reason" value="${escapeAttr(b.reason || '')}">
    <label>exit_code</label>
    <input data-k="exit_code" value="${escapeAttr(b.exit_code || 'success')}">

    <details class="full" open><summary>final（最終出力ペイロード）</summary>
      <fieldset class="inline-list" id="endFinals">
        <div class="hdr"><div>name</div><div></div><div></div><div>value</div><div>del</div></div>
        ${(b.final || []).map(f => endFinalRow(f)).join('')}
        <button type="button" class="accent" id="btnAddFinal">+ add final</button>
      </fieldset>
    </details>

    <details class="full"><summary>run_if / on_error（任意）</summary>
      <div class="form-grid">
        <label>run_if（JSON）</label>
        <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
        <label>on_error</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
        </select>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddFinal') {
      const fs = el('#endFinals', wrap);
      fs.insertAdjacentHTML('beforeend', endFinalRow({ name: 'Key', value: '' }));
    }
    if (e.target.dataset.act === 'delFinal') {
      e.target.closest('.row').remove();
    }
  });

  return wrap;
}

function endFinalRow(f) {
  return `
    <div class="row">
      <input placeholder="name" data-f="name" value="${escapeAttr(f.name || '')}">
      <div></div><div></div>
      <input placeholder="value" data-f="value" value="${escapeAttr(f.value || '')}">
      <button type="button" class="del" data-act="delFinal" aria-label="Delete final"><span class="icon icon-x"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
    </div>
  `;
}

function readEndFormInto(b) {
  b.reason = el('[data-k="reason"]', editorBody).value;
  b.exit_code = el('[data-k="exit_code"]', editorBody).value || 'success';

  const finals = [];
  els('#endFinals .row', editorBody).forEach(r => {
    const name = el('[data-f="name"]', r)?.value.trim() || '';
    const value = el('[data-f="value"]', r)?.value || '';
    if (name) finals.push({ name, value });
  });
  b.final = finals;

  const runIfStr = el('[data-k="run_if"]', editorBody).value.trim();
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  const oe = el('[data-k="on_error"]', editorBody).value;
  b.on_error = oe || undefined;
}

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
