// =========================
/* MABEL Studio Frontend (yaml: YAML export/import utilities)
 * - 本ファイル: YAMLの生成/ダウンロード、YAMLインポート（/api/import 連携）
 * - MABEL v2.1対応（画像入力機能追加）
 */
// =========================

// -------------------------
// YAML Export (MABEL v2.1)
// -------------------------
function toYAML(state) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  try {
    // MABEL v2.1ヘッダー
    push('mabel:');
    push('  version: "2.1"');
    if (state.mabel?.id) push(`  id: ${yamlStr(state.mabel.id)}`);
    if (state.mabel?.name) push(`  name: ${yamlStr(state.mabel.name)}`);
    if (state.mabel?.description) push(`  description: ${yamlStr(state.mabel.description)}`);
    push('');
  } catch (err) {
    console.error('Error in MABEL header section:', err);
    throw new Error('MABEL header section generation failed: ' + err.message);
  }

  // Runtime (存在する場合)
  if (state.runtime && Object.keys(state.runtime).length > 0) {
    push('runtime:');
    if (state.runtime.python) {
      push('  python:');
      const py = state.runtime.python;
      if (py.interpreter) push(`    interpreter: ${yamlStr(py.interpreter)}`);
      if (py.venv) push(`    venv: ${yamlStr(py.venv)}`);
      if (py.requirements_file) push(`    requirements_file: ${yamlStr(py.requirements_file)}`);
      if (py.requirements && Array.isArray(py.requirements)) {
        push('    requirements:');
        py.requirements.forEach(r => push(`      - ${yamlStr(r)}`));
      }
      if (py.allow_network !== undefined) push(`    allow_network: ${py.allow_network}`);
      if (py.env && Object.keys(py.env).length > 0) {
        push('    env:');
        Object.entries(py.env).forEach(([k, v]) => push(`      ${k}: ${yamlStr(v)}`));
      }
    }
    push('');
  }

  // Globals (存在する場合)
  if (state.globals && Object.keys(state.globals).length > 0) {
    push('globals:');
    if (state.globals.const && Object.keys(state.globals.const).length > 0) {
      push('  const:');
      Object.entries(state.globals.const).forEach(([k, v]) => {
        push(`    ${k}: ${typeof v === 'object' ? dumpInlineObj(v) : yamlStr(v)}`);
      });
    }
    if (state.globals.vars && Object.keys(state.globals.vars).length > 0) {
      push('  vars:');
      Object.entries(state.globals.vars).forEach(([k, v]) => {
        push(`    ${k}: ${typeof v === 'object' ? dumpInlineObj(v) : yamlStr(v)}`);
      });
    }
    push('');
  }

  // Budgets (存在する場合)
  if (state.budgets && Object.keys(state.budgets).length > 0) {
    push('budgets:');
    if (state.budgets.loops) {
      push('  loops:');
      push(`    max_iters: ${state.budgets.loops.max_iters || 1000}`);
      if (state.budgets.loops.on_exceed) push(`    on_exceed: ${state.budgets.loops.on_exceed}`);
    }
    if (state.budgets.recursion) {
      push('  recursion:');
      push(`    max_depth: ${state.budgets.recursion.max_depth || 64}`);
      if (state.budgets.recursion.on_exceed) push(`    on_exceed: ${state.budgets.recursion.on_exceed}`);
    }
    if (state.budgets.wall_time_ms) push(`  wall_time_ms: ${state.budgets.wall_time_ms}`);
    if (state.budgets.ai) {
      push('  ai:');
      if (state.budgets.ai.max_calls) push(`    max_calls: ${state.budgets.ai.max_calls}`);
      if (state.budgets.ai.max_tokens) push(`    max_tokens: ${state.budgets.ai.max_tokens}`);
    }
    push('');
  }

  // Functions (存在する場合)
  if (state.functions && Object.keys(state.functions).length > 0) {
    push('functions:');
    if (state.functions.logic && Array.isArray(state.functions.logic)) {
      push('  logic:');
      state.functions.logic.forEach(fn => {
        push(`    - name: ${yamlStr(fn.name)}`);
        if (fn.params) push(`      params: ${dumpInlineObj(fn.params)}`);
        if (fn.body) push(`      body: ${dumpInlineObj(fn.body)}`);
      });
    }
    if (state.functions.python && Array.isArray(state.functions.python)) {
      push('  python:');
      state.functions.python.forEach(fn => {
        push(`    - name: ${yamlStr(fn.name)}`);
        if (fn.params) push(`      params: ${dumpInlineObj(fn.params)}`);
        if (fn.code) push(`      code: ${yamlStr(fn.code)}`);
      });
    }
    push('');
  }

  // Images (v2.1: 静的画像定義)
  if (state.images && Array.isArray(state.images) && state.images.length > 0) {
    push('images:');
    state.images.forEach((img, idx) => {
      try {
        push(`  - name: ${yamlStr(img.name)}`);
        if (img.path) push(`    path: ${yamlStr(img.path)}`);
        if (img.url) push(`    url: ${yamlStr(img.url)}`);
        if (img.base64) {
          // base64は長いので折り返し
          push(`    base64: ${yamlStr(img.base64)}`);
        }
        if (img.media_type && img.media_type !== 'image/png') {
          push(`    media_type: ${yamlStr(img.media_type)}`);
        }
      } catch (err) {
        console.error(`Error processing image ${idx}:`, err, img);
        push(`    # ERROR: Failed to process image ${idx}`);
      }
    });
    push('');
  }

  // Models
  try {
    push('models:');
    state.models.forEach((m, idx) => {
      try {
        push(`  - name: ${yamlStr(m.name)}`);
        push(`    api_model: ${yamlStr(m.api_model)}`);
        push(`    api_key: ${yamlStr(m.api_key)}`);
        if (m.base_url) push(`    base_url: ${yamlStr(m.base_url)}`);
        if (m.organization) push(`    organization: ${yamlStr(m.organization)}`);
        if (m.headers && Object.keys(m.headers).length) push(`    headers: ${dumpInlineObj(m.headers)}`);
        // Reasoning settings
        if (m.enable_reasoning != null) push(`    enable_reasoning: ${m.enable_reasoning}`);
        if (m.include_reasoning != null) push(`    include_reasoning: ${m.include_reasoning}`);
        if (m.exclude_reasoning != null) push(`    exclude_reasoning: ${m.exclude_reasoning}`);
        if (m.reasoning_effort) push(`    reasoning_effort: ${m.reasoning_effort}`);
        if (m.reasoning_max_tokens != null && m.reasoning_max_tokens !== '') push(`    reasoning_max_tokens: ${m.reasoning_max_tokens}`);
      } catch (err) {
        console.error(`Error processing model ${idx}:`, err, m);
        push(`    # ERROR: Failed to process model ${idx}`);
      }
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
  } catch (err) {
    console.error('Error in models section:', err);
    throw new Error('Models section generation failed: ' + err.message);
  }

  // 接続順（exec）とUI位置（y）を考慮した順序 + endを最後に
  try {
    const blocksArr = Array.isArray(state.blocks) ? state.blocks.slice() : [];
    const numFromId = (id) => {
      const m = String(id || '').match(/^b(\d+)$/);
      return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
    };
    const ordered = blocksArr.slice().sort((a, b) => {
      const endA = a.type === 'end', endB = b.type === 'end';
      if (endA !== endB) return endA ? 1 : -1; // endは常に最後
      const exA = a.exec || 1, exB = b.exec || 1;
      if (exA !== exB) return exA - exB; // トポロジカル順（exec昇順）
      const yA = Number.isFinite(a?.position?.y) ? a.position.y : 0;
      const yB = Number.isFinite(b?.position?.y) ? b.position.y : 0;
      if (yA !== yB) return yA - yB;      // 見た目の上下で安定化
      return numFromId(a.id) - numFromId(b.id); // 末尾の安定化
    });
    const numbering = new Map();
    ordered.forEach((bb, i) => numbering.set(bb.id, i + 1));

    push('blocks:');
    ordered.forEach(b => {
      try {
        // startブロックはYAMLに出力しない
        if (b.type === 'start') return;

        push(`  - type: ${b.type}`);
        push(`    exec: ${b.exec || 1}`);
        // YAML用の接続順ナンバー（1..N）を付与
        push(`    no: ${numbering.get(b.id) || 0}`);

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

          // mode (v2)
          if (b.mode) push(`    mode: ${b.mode}`);

          push(`    outputs:`);
          (b.outputs || []).forEach(o => {
            push(`      - name: ${yamlStr(o.name)}`);
            push(`        select: ${o.select || 'full'}`);
            if (o.select === 'tag' && o.tag) push(`        tag: ${yamlStr(o.tag)}`);
            if (o.select === 'jsonpath' && o.path) push(`        path: ${yamlStr(o.path)}`);
            if (o.select === 'regex' && o.regex) push(`        regex: ${yamlStr(o.regex)}`);
            if (o.join_with) push(`        join_with: ${yamlStr(o.join_with)}`);
            if (o.type_hint) push(`        type_hint: ${yamlStr(o.type_hint)}`);
          });

          // save_to (v2)
          if (b.save_to && b.save_to.vars && Object.keys(b.save_to.vars).length > 0) {
            push(`    save_to:`);
            push(`      vars:`);
            Object.entries(b.save_to.vars).forEach(([k, v]) => {
              push(`        ${k}: ${yamlStr(v)}`);
            });
          }

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
          if (b.retry) push(`    retry: ${dumpInlineObj(b.retry)}`);
          if (b.budget) push(`    budget: ${dumpInlineObj(b.budget)}`);

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
          } else if (b.op === 'set') {
            // v2: set演算子
            if (b.var) push(`    var: ${yamlStr(b.var)}`);
            if (b.value !== undefined) {
              push(`    value: ${dumpInlineObj(b.value)}`);
            }
          } else if (b.op === 'let') {
            // v2: let演算子
            if (b.bindings) push(`    bindings: ${dumpInlineObj(b.bindings)}`);
            if (b.body) push(`    body: ${dumpInlineObj(b.body)}`);
          } else if (b.op === 'reduce') {
            // v2: reduce演算子
            if (b.list !== undefined) push(`    list: ${yamlStr(b.list || '')}`);
            if (b.value !== undefined) push(`    value: ${dumpInlineObj(b.value)}`);
            if (b.var) push(`    var: ${yamlStr(b.var)}`);
            if (b.accumulator) push(`    accumulator: ${yamlStr(b.accumulator)}`);
            if (b.body) push(`    body: ${dumpInlineObj(b.body)}`);
          } else if (b.op === 'while') {
            // v2: while演算子
            if (b.init) push(`    init: ${dumpInlineObj(b.init)}`);
            if (b.cond) push(`    cond: ${dumpInlineObj(b.cond)}`);
            if (b.step) push(`    step: ${dumpInlineObj(b.step)}`);
            if (b.budget) push(`    budget: ${dumpInlineObj(b.budget)}`);
          } else if (b.op === 'call') {
            // v2: call演算子
            if (b.function) push(`    function: ${yamlStr(b.function)}`);
            if (b.with) push(`    with: ${dumpInlineObj(b.with)}`);
            if (b.returns && Array.isArray(b.returns)) {
              push(`    returns: [${b.returns.map(x => yamlStr(x)).join(', ')}]`);
            }
          } else if (b.op === 'emit') {
            // v2: emit演算子
            if (b.value !== undefined) {
              push(`    value: ${dumpInlineObj(b.value)}`);
            }
          } else if (b.op === 'recurse') {
            // v2: recurse演算子
            if (b.name) push(`    name: ${yamlStr(b.name)}`);
            if (b.function) push(`    function: ${dumpInlineObj(b.function)}`);
            if (b.with) push(`    with: ${dumpInlineObj(b.with)}`);
            if (b.budget) push(`    budget: ${dumpInlineObj(b.budget)}`);
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
          if (b.function || b.entrypoint) push(`    function: ${yamlStr(b.function || b.entrypoint || '')}`);

          // function_code (v2)
          if (b.function_code) {
            push(`    function_code: |`);
            b.function_code.split('\n').forEach(line => push(`      ${line}`));
          }

          push(`    inputs: [${(b.inputs || []).map(x => yamlStr(x)).join(', ')}]`);

          if (b.code_path) push(`    code_path: ${yamlStr(b.code_path)}`);
          if (b.venv_path) push(`    venv_path: ${yamlStr(b.venv_path)}`);

          // v2拡張フィールド
          if (b.use_env && b.use_env !== 'global') push(`    use_env: ${b.use_env}`);
          if (b.timeout_ms) push(`    timeout_ms: ${b.timeout_ms}`);
          if (b.ctx_access && Array.isArray(b.ctx_access)) {
            push(`    ctx_access: [${b.ctx_access.map(x => yamlStr(x)).join(', ')}]`);
          }

          push(`    outputs: [${(b.py_outputs || []).map(x => yamlStr(x)).join(', ')}]`);

          if (b.run_if) push(`    run_if: ${dumpInlineObj(b.run_if)}`);
          if (b.on_error) push(`    on_error: ${b.on_error}`);
          if (b.retry) push(`    retry: ${dumpInlineObj(b.retry)}`);

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
      } catch (err) {
        console.error(`Error processing block ${b.id}:`, err, b);
        push(`    # ERROR: Failed to process block ${b.id}`);
        push('');
      }
    });
  } catch (err) {
    console.error('Error in blocks section:', err);
    throw new Error('Blocks section generation failed: ' + err.message);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function yamlStr(s) {
  if (s === undefined || s === null) return "''";
  try {
    const str = String(s);
    if (/^[A-Za-z0-9_\-./:]+$/.test(str)) return str;
    return JSON.stringify(str);
  } catch (err) {
    console.warn('yamlStr error:', err, s);
    return "''";
  }
}

function dumpInlineObj(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    console.warn('dumpInlineObj error:', err, v);
    return '{}';
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/yaml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// -------------------------
// Models-only YAML Export
// -------------------------
function toYAMLModels(stateOrModels) {
  const models = Array.isArray(stateOrModels) ? stateOrModels : (stateOrModels && Array.isArray(stateOrModels.models) ? stateOrModels.models : []);
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('models:');
  models.forEach(m => {
    push(`  - name: ${yamlStr(m.name)}`);
    push(`    api_model: ${yamlStr(m.api_model)}`);
    push(`    api_key: ${yamlStr(m.api_key)}`);
    if (m.base_url) push(`    base_url: ${yamlStr(m.base_url)}`);
    if (m.organization) push(`    organization: ${yamlStr(m.organization)}`);
    if (m.headers && Object.keys(m.headers).length) push(`    headers: ${dumpInlineObj(m.headers)}`);
    // Reasoning settings
    if (m.enable_reasoning != null) push(`    enable_reasoning: ${m.enable_reasoning}`);
    if (m.include_reasoning != null) push(`    include_reasoning: ${m.include_reasoning}`);
    if (m.exclude_reasoning != null) push(`    exclude_reasoning: ${m.exclude_reasoning}`);
    if (m.reasoning_effort) push(`    reasoning_effort: ${m.reasoning_effort}`);
    if (m.reasoning_max_tokens != null && m.reasoning_max_tokens !== '') push(`    reasoning_max_tokens: ${m.reasoning_max_tokens}`);
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

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

// -------------------------
// Import YAML via backend
// -------------------------
async function importYamlText(text) {
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: text })
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = (data && (data.message || data.error)) ? (data.message || data.error) : res.statusText;
      alert('Import failed: ' + detail);
      return;
    }
    const st = (data && typeof data === 'object' && 'state' in data) ? data.state : data;

    // v2.1トップレベル要素の反映
    if (st.mabel) state.mabel = st.mabel;
    if (st.runtime) state.runtime = st.runtime;
    if (st.globals) state.globals = st.globals;
    if (st.budgets) state.budgets = st.budgets;
    if (st.functions) state.functions = st.functions;
    if (st.images) state.images = st.images;  // v2.1: 静的画像定義
    if (st.templates) state.templates = st.templates;
    if (st.files) state.files = st.files;

    // 旧状態から「exec列ごとの順序」で座標とIDを継承
    const prevBlocks = Array.isArray(state.blocks) ? state.blocks : [];
    const prevByExec = new Map();
    prevBlocks.forEach(b => {
      const ex = b.exec || 1;
      if (!prevByExec.has(ex)) prevByExec.set(ex, []);
      prevByExec.get(ex).push(b);
    });
    const idxByExec = new Map();
    const importedBlocks = Array.isArray(st.blocks) ? st.blocks : [];

    // 新規ID採番の開始位置は旧ブロック群から算出
    let nextId = nextIdFromBlocks(prevBlocks);

    const newBlocks = importedBlocks.map(b => {
      const bb = JSON.parse(JSON.stringify(b || {}));
      const ex = bb.exec || 1;
      const list = prevByExec.get(ex) || [];
      const idx = idxByExec.get(ex) || 0;
      const prev = list[idx];
      idxByExec.set(ex, idx + 1);

      // 位置継承（あれば）
      if (prev && prev.position && Number.isFinite(prev.position.x) && Number.isFinite(prev.position.y)) {
        bb.position = { x: prev.position.x, y: prev.position.y };
      }

      // ID継承（あれば）。なければ新規採番。
      bb.id = (prev && prev.id) ? prev.id : ('b' + nextId++);

      // UIタイトル補完（name等があればtitleに反映）
      if (!bb.title && bb.name) bb.title = bb.name;
      if (!bb.title && bb.py_name) bb.title = bb.py_name;

      return bb;
    });

    // Pythonブロック: YAML の outputs → py_outputs に変換（UI内部フィールドとYAMLフィールドの対応づけ）
    newBlocks.forEach(bb => {
      if (bb.type === 'python') {
        // outputs が存在し py_outputs が未設定の場合に変換
        if (!bb.py_outputs && bb.outputs) {
          bb.py_outputs = (bb.outputs || []).map(o =>
            typeof o === 'string' ? o : (o && o.name) ? o.name : ''
          ).filter(Boolean);
          delete bb.outputs;
        }
        // inputs が空オブジェクト {} などの非配列の場合は空配列に正規化
        if (bb.inputs && !Array.isArray(bb.inputs)) {
          bb.inputs = [];
        }
        // py_name がなければ name フィールドを使用
        if (!bb.py_name && bb.name) bb.py_name = bb.name;
      }
    });

    // モデルはそのまま置換
    state.models = Array.isArray(st.models) ? st.models : [];

    // ブロック反映
    state.blocks = newBlocks;
    state.idCounter = nextIdFromBlocks(state.blocks);

    // 配線からexecを再計算（位置は維持）
    autoAssignExecFromEdges();

    // 未配置のものだけ自動整列（既存座標は触らない）
    autolayoutByExec({ onlyUnset: true });

    renderModelsPanel();
    renderNodes();
    // SVGサイズとビューを同期してから配線描画（描画欠落対策）
    if (typeof syncSvgToCanvas === 'function') syncSvgToCanvas();
    if (typeof applyViewport === 'function') applyViewport();
    drawConnections();

    const yamlModal = document.getElementById('yamlModal');
    if (typeof yamlPreview !== 'undefined' && yamlPreview) {
      try {
        yamlPreview.value = toYAML(state);
      } catch (e) {
        yamlPreview.value = text;
      }
    }
    if (yamlModal && typeof yamlModal.showModal === 'function') {
      yamlModal.showModal();
    } else if (yamlModal) {
      yamlModal.setAttribute('open', '');
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
