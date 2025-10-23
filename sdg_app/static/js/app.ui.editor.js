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

  if (b.type === 'ai') editorBody.appendChild(buildAiForm(b));
  if (b.type === 'logic') editorBody.appendChild(buildLogicForm(b));
  if (b.type === 'python') editorBody.appendChild(buildPythonForm(b));
  if (b.type === 'end') editorBody.appendChild(buildEndForm(b));

  const detected = inferredInputs(b);
  const info = document.createElement('div');
  info.innerHTML = `
    <p class="small-note">Detected inputs from <span class="kbd">{...}</span>: ${detected.map(x=>`<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</p>
  `;
  editorBody.appendChild(info);

  editorForm.onsubmit = (ev) => {
    ev.preventDefault();
    const t = el('[data-k="title"]', editorBody).value.trim();
    const ex = Number(el('[data-k="exec"]', editorBody).value) || 1;
    b.title = t; b.exec = ex;

    if (b.type === 'ai') readAiFormInto(b);
    if (b.type === 'logic') readLogicFormInto(b);
    if (b.type === 'python') readPythonFormInto(b);
    if (b.type === 'end') readEndFormInto(b);

    autoAssignExecFromEdges();
    autolayoutByExec();

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

    <details class="full" open><summary>outputs（必須）</summary>
      <fieldset class="inline-list" id="aiOutputs">
        <div class="hdr"><div>name</div><div>select</div><div>tag</div><div>regex</div><div>del</div></div>
        <div class="small-note">name / select / tag / regex / join_with（selectに応じて必要のみ）</div>
        ${ (b.outputs || []).map((o, i) => aiOutputRow(o, i)).join('') }
        <button type="button" class="accent" id="btnAddOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>params（任意・モデルdefaultsを上書き）</summary>
      <div class="form-grid">
        ${['temperature','top_p','max_tokens'].map(k => `
          <label>${k}</label><input data-param="${k}" value="${b.params?.[k] ?? ''}">
        `).join('')}
        <label>stop（カンマ区切り）</label><input data-param="stop" value="${(b.params?.stop || []).join(',')}">
      </div>
    </details>

    <details class="full"><summary>run_if / on_error（任意）</summary>
      <div class="form-grid">
        <label>run_if（JSON: 例 {"equals":["{Flag}","on"]}）</label>
        <input data-k="run_if" class="full" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
        <label>on_error</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error==='fail'?'selected':''}>fail</option>
          <option value="continue" ${b.on_error==='continue'?'selected':''}>continue</option>
        </select>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddOut') {
      const fieldset = el('#aiOutputs', wrap);
      const o = { name: 'Out_' + Math.random().toString(36).slice(2,6), select: 'full', tag:'', regex:'', join_with:'' };
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
        <option value="full" ${o.select==='full'?'selected':''}>full</option>
        <option value="tag" ${o.select==='tag'?'selected':''}>tag</option>
        <option value="regex" ${o.select==='regex'?'selected':''}>regex</option>
      </select>
      <input placeholder="tag (when select=tag)" data-o="tag" value="${escapeAttr(o.tag || '')}">
      <input placeholder="regex (when select=regex)" data-o="regex" value="${escapeAttr(o.regex || '')}">
      <button type="button" class="del" data-act="delOut" aria-label="Delete output">✕</button>
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

  const outRows = els('#aiOutputs .row', editorBody);
  const outputs = [];
  for (let i = 0; i < outRows.length; i += 2) {
    const rMain = outRows[i];
    const rJoin = outRows[i+1];
    if (!rMain) continue;
    const o = {
      name: el('[data-o="name"]', rMain).value.trim(),
      select: el('[data-o="select"]', rMain).value,
      tag: el('[data-o="tag"]', rMain).value.trim(),
      regex: el('[data-o="regex"]', rMain).value.trim(),
      join_with: rJoin ? (el('[data-o="join_with"]', rJoin).value) : ''
    };
    if (o.name) outputs.push(o);
  }
  b.outputs = outputs;

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

  const runIfStr = el('[data-k="run_if"]', editorBody).value.trim();
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  const oe = el('[data-k="on_error"]', editorBody).value;
  b.on_error = oe || undefined;
}

function buildLogicForm(b) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.innerHTML = `
    <label>name（任意）</label>
    <input data-k="name" value="${escapeAttr(b.name || '')}">

    <label>op</label>
    <select data-k="op">
      <option value="if" ${b.op==='if'?'selected':''}>if</option>
      <option value="and" ${b.op==='and'?'selected':''}>and</option>
      <option value="or" ${b.op==='or'?'selected':''}>or</option>
      <option value="not" ${b.op==='not'?'selected':''}>not</option>
      <option value="for" ${b.op==='for'?'selected':''}>for</option>
    </select>

    <details class="full"><summary>条件・分岐（op=if時）</summary>
      <div class="form-grid">
        <label>cond（JSON）</label>
        <input class="full" data-k="cond" value='${escapeAttr(JSON.stringify(b.cond || {}))}'>
        <label>then</label><input data-k="then" value="${escapeAttr(b.then || '')}">
        <label>else</label><input data-k="else" value="${escapeAttr(b.else || '')}">
      </div>
    </details>

    <details class="full"><summary>operands（op=and/or/not時, JSON配列）</summary>
      <input class="full" data-k="operands" value='${b.operands ? escapeAttr(JSON.stringify(b.operands)) : ''}'>
    </details>

    <details class="full"><summary>for 仕様（op=for時）</summary>
      <div class="form-grid">
        <label>list</label>
        <input class="full" data-k="list" value="${escapeAttr(b.list || '')}">
        <label>parse</label>
        <select data-k="parse">
          <option value="">(default: lines)</option>
          <option value="lines" ${b.parse==='lines'?'selected':''}>lines</option>
          <option value="csv" ${b.parse==='csv'?'selected':''}>csv</option>
          <option value="json" ${b.parse==='json'?'selected':''}>json</option>
          <option value="regex" ${b.parse==='regex'?'selected':''}>regex</option>
        </select>
        <label>regex_pattern（parse=regex時）</label>
        <input data-k="regex_pattern" class="full" value="${escapeAttr(b.regex_pattern || '')}">
        <label>var（既定: item）</label>
        <input data-k="var" value="${escapeAttr(b.var || '')}">
        <label>drop_empty</label>
        <select data-k="drop_empty">
          <option value="">(default: true)</option>
          <option value="true" ${b.drop_empty===true?'selected':''}>true</option>
          <option value="false" ${b.drop_empty===false?'selected':''}>false</option>
        </select>
        <label>where（条件, JSON）</label>
        <input data-k="where" class="full" value='${b.where ? escapeAttr(JSON.stringify(b.where)) : ''}'>
        <label>map（テンプレート）</label>
        <input data-k="map" class="full" value="${escapeAttr(b.map || '')}">
      </div>
    </details>

    <details class="full" open><summary>outputs（任意）</summary>
      <fieldset class="inline-list" id="logicOutputs">
        <div class="hdr"><div>name</div><div>from</div><div>source</div><div>join_with</div><div>del</div></div>
        <div class="small-note">name / from(boolean|value|join|count|any|all|first|last|list) / source(raw|filtered|mapped) / join_with / test(JSON) / limit / offset</div>
        ${ (b.outputs || []).map(o => logicOutputRow(o)).join('') }
        <button type="button" class="accent" id="btnAddLogicOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>run_if / on_error（任意）</summary>
      <div class="form-grid">
        <label>run_if（JSON）</label>
        <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
        <label>on_error</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error==='fail'?'selected':''}>fail</option>
          <option value="continue" ${b.on_error==='continue'?'selected':''}>continue</option>
        </select>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddLogicOut') {
      const fs = el('#logicOutputs', wrap);
      fs.insertAdjacentHTML('beforeend', logicOutputRow({ name: 'Out_' + Math.random().toString(36).slice(2,6), from: 'boolean' }));
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

function logicOutputRow(o) {
  return `
    <div class="row">
      <input placeholder="name" data-o="name" value="${escapeAttr(o.name || '')}">
      <select data-o="from">
        <option value="boolean" ${o.from==='boolean'?'selected':''}>boolean</option>
        <option value="value" ${o.from==='value'?'selected':''}>value</option>
        <option value="join" ${o.from==='join'?'selected':''}>join</option>
        <option value="count" ${o.from==='count'?'selected':''}>count</option>
        <option value="any" ${o.from==='any'?'selected':''}>any</option>
        <option value="all" ${o.from==='all'?'selected':''}>all</option>
        <option value="first" ${o.from==='first'?'selected':''}>first</option>
        <option value="last" ${o.from==='last'?'selected':''}>last</option>
        <option value="list" ${o.from==='list'?'selected':''}>list</option>
      </select>
      <select data-o="source">
        <option value="" ${!o.source?'selected':''}>(default)</option>
        <option value="raw" ${o.source==='raw'?'selected':''}>raw</option>
        <option value="filtered" ${o.source==='filtered'?'selected':''}>filtered</option>
        <option value="mapped" ${o.source==='mapped'?'selected':''}>mapped</option>
      </select>
      <input placeholder="join_with" data-o="join_with" value="${escapeAttr(o.join_with || '')}">
      <button type="button" class="del" data-act="delOut" aria-label="Delete output">✕</button>
    </div>
    <div class="row">
      <input placeholder='test（JSON, any/all用）' data-o="test" value='${o.test ? escapeAttr(JSON.stringify(o.test)) : ''}'>
      <input placeholder="limit" data-o="limit" value="${o.limit ?? ''}">
      <input placeholder="offset" data-o="offset" value="${o.offset ?? ''}">
      <div></div>
      <div></div>
    </div>
  `;
}

function readLogicFormInto(b) {
  b.name = el('[data-k="name"]', editorBody).value.trim();
  b.op = el('[data-k="op"]', editorBody).value;

  const condStr = el('[data-k="cond"]', editorBody).value.trim();
  b.cond = condStr ? safeParseJson(condStr, {}) : undefined;

  b.then = el('[data-k="then"]', editorBody).value;
  b.else = el('[data-k="else"]', editorBody).value;

  const opsStr = el('[data-k="operands"]', editorBody).value.trim();
  b.operands = opsStr ? safeParseJson(opsStr, []) : undefined;

  // for spec
  b.list = el('[data-k="list"]', editorBody).value;
  b.parse = el('[data-k="parse"]', editorBody).value || undefined;
  b.regex_pattern = el('[data-k="regex_pattern"]', editorBody).value || undefined;
  const varVal = el('[data-k="var"]', editorBody).value.trim();
  b.var = varVal || undefined;
  const dropSel = el('[data-k="drop_empty"]', editorBody).value;
  if (dropSel === '') {
    b.drop_empty = undefined;
  } else {
    b.drop_empty = (dropSel === 'true');
  }
  const whereStr = el('[data-k="where"]', editorBody).value.trim();
  b.where = whereStr ? safeParseJson(whereStr, null) : undefined;
  b.map = el('[data-k="map"]', editorBody).value;

  // outputs
  const rows = els('#logicOutputs .row', editorBody);
  const outs = [];
  for (let i = 0; i < rows.length; i += 2) {
    const r1 = rows[i];
    const r2 = rows[i+1];
    if (!r1) continue;
    const name = el('[data-o="name"]', r1)?.value.trim() || '';
    if (!name) continue;
    const from = el('[data-o="from"]', r1)?.value || 'boolean';
    const src = el('[data-o="source"]', r1)?.value?.trim() || '';
    const jw = el('[data-o="join_with"]', r1)?.value || '';

    const testStr = r2 ? (el('[data-o="test"]', r2)?.value.trim() || '') : '';
    const limitStr = r2 ? (el('[data-o="limit"]', r2)?.value.trim() || '') : '';
    const offsetStr = r2 ? (el('[data-o="offset"]', r2)?.value.trim() || '') : '';

    const o = { name, from };
    if (src) o.source = src;
    if (jw) o.join_with = jw;
    if (testStr) {
      const parsed = safeParseJson(testStr, null);
      if (parsed !== null) o.test = parsed;
    }
    if (limitStr !== '') o.limit = toMaybeNumber(limitStr);
    if (offsetStr !== '') o.offset = toMaybeNumber(offsetStr);
    outs.push(o);
  }
  b.outputs = outs;

  const runIfStr = el('[data-k="run_if"]', editorBody).value.trim();
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  const oe = el('[data-k="on_error"]', editorBody).value;
  b.on_error = oe || undefined;
}

function buildPythonForm(b) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.innerHTML = `
    <label>name（必須）</label>
    <input data-k="py_name" value="${escapeAttr(b.py_name || '')}">
    <label>function（必須）</label>
    <input data-k="function" value="${escapeAttr(b.function || '')}">

    <label>inputs（複数可・候補から選択/自由入力）</label>
    <input class="full" data-k="inputs" placeholder="例: Answer, Plan" value="${escapeAttr((b.inputs || []).join(', '))}">
    <div class="small-note full">利用可能な出力: ${allOutputNames().map(x=>`<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</div>

    <label>code_path</label>
    <input class="full" data-k="code_path" value="${escapeAttr(b.code_path || '')}">
    <label>venv_path</label>
    <input class="full" data-k="venv_path" value="${escapeAttr(b.venv_path || '')}">

    <details class="full"><summary>outputs（必須）</summary>
      <fieldset class="inline-list" id="pyOutputs">
        ${ (b.py_outputs || []).map(o => `
          <div class="row python">
            <input placeholder="output name" data-o="py_out" value="${escapeAttr(o)}">
            <div></div>
            <button type="button" class="del" data-act="delPyOut" aria-label="Delete output">✕</button>
          </div>
        `).join('') }
        <button type="button" class="accent" id="btnAddPyOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>run_if / on_error（任意）</summary>
      <div class="form-grid">
        <label>run_if（JSON）</label>
        <input class="full" data-k="run_if" value='${b.run_if ? escapeAttr(JSON.stringify(b.run_if)) : ''}'>
        <label>on_error</label>
        <select data-k="on_error">
          <option value="">(default: fail)</option>
          <option value="fail" ${b.on_error==='fail'?'selected':''}>fail</option>
          <option value="continue" ${b.on_error==='continue'?'selected':''}>continue</option>
        </select>
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
          <button type="button" class="del" data-act="delPyOut" aria-label="Delete output">✕</button>
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
  b.inputs = el('[data-k="inputs"]', editorBody).value.split(',').map(s=>s.trim()).filter(Boolean);
  b.code_path = el('[data-k="code_path"]', editorBody).value.trim();
  b.venv_path = el('[data-k="venv_path"]', editorBody).value.trim();

  const outs = [];
  els('#pyOutputs [data-o="py_out"]', editorBody).forEach(inp => {
    const v = inp.value.trim(); if (v) outs.push(v);
  });
  b.py_outputs = outs;

  const runIfStr = el('[data-k="run_if"]', editorBody).value.trim();
  b.run_if = runIfStr ? safeParseJson(runIfStr, null) : null;
  const oe = el('[data-k="on_error"]', editorBody).value;
  b.on_error = oe || undefined;
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
        ${ (b.final || []).map(f => endFinalRow(f)).join('') }
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
          <option value="fail" ${b.on_error==='fail'?'selected':''}>fail</option>
          <option value="continue" ${b.on_error==='continue'?'selected':''}>continue</option>
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
      <button type="button" class="del" data-act="delFinal" aria-label="Delete final">✕</button>
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
    if (b.type === 'ai') (b.outputs||[]).forEach(o => { if (o.name) names.push(o.name); });
    if (b.type === 'logic') (b.outputs||[]).forEach(o => { if (o.name) names.push(o.name); });
    if (b.type === 'python') (b.py_outputs||[]).forEach(n => { if (n) names.push(n); });
  });
  return names;
}
