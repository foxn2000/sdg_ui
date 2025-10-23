// =========================
/* MABEL Studio Frontend (yaml: YAML export/import utilities)
 * - 本ファイル: YAMLの生成/ダウンロード、YAMLインポート（/api/import 連携）
 */
// =========================

// -------------------------
// YAML Export
// -------------------------
function toYAML(state) {
  const lines = [];
  const push = (s='') => lines.push(s);

  push('models:');
  state.models.forEach(m => {
    push(`  - name: ${yamlStr(m.name)}`);
    push(`    api_model: ${yamlStr(m.api_model)}`);
    push(`    api_key: ${yamlStr(m.api_key)}`);
    if (m.base_url) push(`    base_url: ${yamlStr(m.base_url)}`);
    if (m.organization) push(`    organization: ${yamlStr(m.organization)}`);
    if (m.headers && Object.keys(m.headers).length) push(`    headers: ${dumpInlineObj(m.headers)}`);
    const d = m.request_defaults || {};
    const hasD = Object.keys(d).some(k => {
      const v = d[k];
      if (v === '' || v === undefined) return false;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    });
    if (hasD) {
      push(`    request_defaults:`);
      if (d.temperature !== undefined && d.temperature !== '') push(`      temperature: ${d.temperature}`);
      if (d.top_p !== undefined && d.top_p !== '') push(`      top_p: ${d.top_p}`);
      if (d.max_tokens !== undefined && d.max_tokens !== '') push(`      max_tokens: ${d.max_tokens}`);
      if (d.timeout_sec !== undefined && d.timeout_sec !== '') push(`      timeout_sec: ${d.timeout_sec}`);
      if (d.retry && (d.retry.max_attempts || d.retry.backoff)) {
        push(`      retry:`);
        if (d.retry.max_attempts !== undefined && d.retry.max_attempts !== '') push(`        max_attempts: ${d.retry.max_attempts}`);
        if (d.retry.backoff && Object.keys(d.retry.backoff).length) {
          push(`        backoff: ${dumpInlineObj(d.retry.backoff)}`);
        }
      }
    }
    push('');
  });

  push('blocks:');
  state.blocks.forEach(b => {
    push(`  - type: ${b.type}`);
    push(`    exec: ${b.exec || 1}`);

    if (b.type === 'ai') {
      if (b.model) push(`    model: ${yamlStr(b.model)}`); else push(`    # WARNING: model is empty`);

      if (b.system_prompt && b.system_prompt.includes('\n')) {
        push(`    system_prompt: |`);
        b.system_prompt.split('\n').forEach(line => push(`      ${line}`));
      } else {
        push(`    system_prompt: ${yamlStr(b.system_prompt || '')}`);
      }

      push(`    prompts:`);
      (b.prompts || ['']).forEach(p => {
        if (p.includes('\n')) {
          push(`      - |`);
          p.split('\n').forEach(line => push(`          ${line}`));
        } else {
          push(`      - ${yamlStr(p)}`);
        }
      });

      push(`    outputs:`);
      (b.outputs || []).forEach(o => {
        push(`      - name: ${yamlStr(o.name)}`);
        push(`        select: ${o.select || 'full'}`);
        if (o.select === 'tag' && o.tag) push(`        tag: ${yamlStr(o.tag)}`);
        if (o.select === 'regex' && o.regex) push(`        regex: ${yamlStr(o.regex)}`);
        if (o.join_with) push(`        join_with: ${yamlStr(o.join_with)}`);
      });

      if (b.params && Object.keys(b.params).length) {
        push(`    params:`);
        Object.entries(b.params).forEach(([k, v]) => {
          if (k === 'stop' && Array.isArray(v)) {
            push(`      stop: [${v.map(x => yamlStr(x)).join(', ')}]`);
          } else {
            push(`      ${k}: ${typeof v === 'number' ? v : yamlStr(v)}`);
          }
        });
      }

      if (b.run_if) push(`    run_if: ${dumpInlineObj(b.run_if)}`);
      if (b.on_error) push(`    on_error: ${b.on_error}`);

    } else if (b.type === 'logic') {
      if (b.name) push(`    name: ${yamlStr(b.name)}`);
      push(`    op: ${b.op}`);

      if (b.op === 'if') {
        push(`    cond: ${dumpInlineObj(b.cond || {})}`);
        if (b.then !== undefined) push(`    then: ${yamlStr(b.then)}`);
        if (b.else !== undefined) push(`    else: ${yamlStr(b.else)}`);
      } else if (b.op === 'and' || b.op === 'or' || b.op === 'not') {
        if (b.operands) push(`    operands: ${dumpInlineObj(b.operands)}`);
      } else if (b.op === 'for') {
        if (b.list !== undefined) push(`    list: ${yamlStr(b.list || '')}`);
        if (b.parse) push(`    parse: ${b.parse}`);
        if (b.parse === 'regex' && b.regex_pattern) push(`    regex_pattern: ${yamlStr(b.regex_pattern)}`);
        if (b.var) push(`    var: ${yamlStr(b.var)}`);
        if (b.drop_empty !== undefined) push(`    drop_empty: ${b.drop_empty}`);
        if (b.where) push(`    where: ${dumpInlineObj(b.where)}`);
        if (b.map) push(`    map: ${yamlStr(b.map)}`);
      }

      if (b.outputs && b.outputs.length) {
        push(`    outputs:`);
        b.outputs.forEach(o => {
          push(`      - name: ${yamlStr(o.name)}`);
          push(`        from: ${o.from || 'boolean'}`);
          if (o.test !== undefined) push(`        test: ${dumpInlineObj(o.test)}`);
          if (o.source) push(`        source: ${o.source}`);
          if (o.join_with) push(`        join_with: ${yamlStr(o.join_with)}`);
          if (o.limit !== undefined) push(`        limit: ${o.limit}`);
          if (o.offset !== undefined) push(`        offset: ${o.offset}`);
        });
      }

      if (b.run_if) push(`    run_if: ${dumpInlineObj(b.run_if)}`);
      if (b.on_error) push(`    on_error: ${b.on_error}`);

    } else if (b.type === 'python') {
      push(`    name: ${yamlStr(b.py_name || '')}`);
      push(`    function: ${yamlStr(b.function || '')}`);
      push(`    inputs: [${(b.inputs || []).map(x => yamlStr(x)).join(', ')}]`);
      push(`    code_path: ${yamlStr(b.code_path || './script.py')}`);
      push(`    venv_path: ${yamlStr(b.venv_path || './.venv')}`);
      push(`    outputs: [${(b.py_outputs || []).map(x => yamlStr(x)).join(', ')}]`);
      if (b.run_if) push(`    run_if: ${dumpInlineObj(b.run_if)}`);
      if (b.on_error) push(`    on_error: ${b.on_error}`);

    } else if (b.type === 'end') {
      if (b.reason !== undefined && b.reason !== '') push(`    reason: ${yamlStr(b.reason)}`);
      if (b.exit_code) push(`    exit_code: ${yamlStr(b.exit_code)}`);
      if (Array.isArray(b.final) && b.final.length) {
        push(`    final:`);
        b.final.forEach(f => {
          push(`      - name: ${yamlStr(f.name || '')}`);
          push(`        value: ${yamlStr(f.value || '')}`);
        });
      }
      if (b.run_if) push(`    run_if: ${dumpInlineObj(b.run_if)}`);
      if (b.on_error) push(`    on_error: ${b.on_error}`);
    }

    push('');
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function yamlStr(s) {
  if (s === undefined || s === null) return "''";
  const str = String(s);
  if (/^[A-Za-z0-9_\-./:]+$/.test(str)) return str;
  return JSON.stringify(str);
}

function dumpInlineObj(v) {
  return JSON.stringify(v);
}

function downloadText(filename, text) {
  const blob = new Blob([text], {type: 'text/yaml'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// -------------------------
// Import YAML via backend
// -------------------------
async function importYamlText(text) {
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ yaml: text })
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Import failed: ' + (data.error || res.statusText));
      return;
    }
    state.models = Array.isArray(data.models) ? data.models : [];
    state.blocks = Array.isArray(data.blocks) ? data.blocks : [];
    state.idCounter = nextIdFromBlocks(state.blocks);

    autoAssignExecFromEdges();
    autolayoutByExec();

    renderModelsPanel();
    renderNodes();
    drawConnections();

    if (typeof yamlPreview !== 'undefined' && yamlPreview) {
      yamlPreview.value = text;
    }
    if (typeof previewWrap !== 'undefined' && previewWrap && !previewWrap.open) {
      previewWrap.open = true;
    }

  } catch (err) {
    console.error(err);
    alert('Import failed (network or server error). Check console.');
  }
}

function nextIdFromBlocks(blocks) {
  let maxN = 0;
  blocks.forEach(b => {
    const m = String(b.id || '').match(/^b(\d+)$/);
    const n = m ? Number(m[1]) : 0;
    if (n > maxN) maxN = n;
  });
  return maxN + 1;
}
