// =========================
/* MABEL Studio Frontend (ui: initialization, UI rendering, editor, DnD, pan/zoom)
 * - 本ファイル: 初期化処理、モデル/ノードUI、編集モーダル、ドラッグ&ドロップ、
 *               パン/ズーム、トップボタン、キーボード操作等のUIレイヤ
 * - 依存:
 *   - app.core.js（state, DOM参照, viewport, utils, snap, applyViewport, raf, bootstrapDefaults, syncSvgToCanvas など）
 *   - app.graph.js（drawConnections, computeEdges, inferredInputs, contentBounds, autolayoutByExec, autoAssignExecFromEdges など）
 *   - app.yaml.js（toYAML, importYamlText, downloadText など）
 */
// =========================

// -------------------------
// Initialization
// -------------------------
document.addEventListener('DOMContentLoaded', () => {
  bootstrapDefaults();
  bindLibraryDnD();
  bindGlobalButtons();
  bindImport();
  bindCanvasPanning();
  bindZooming();         // ズーム操作
  mountZoomHud();        // HUD
  renderModelsPanel();
  renderNodes();
  syncSvgToCanvas();
  applyViewport();
  drawConnections();

  new ResizeObserver(() => {
    syncSvgToCanvas();
    drawConnections();
  }).observe(canvas);

  editorBody.addEventListener('input', () => {
    raf(drawConnections);
  });

  // keyboard: delete & nudge & zoom keys
  document.addEventListener('keydown', (e) => {
    if (editorModal.open) return;
    if (isEditableTarget(e.target)) return;

    // Delete selected block
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId) {
      e.preventDefault();
      removeBlock(selectedBlockId);
      selectedBlockId = null;
      return;
    }

    // Arrow keys: nudge
    if (selectedBlockId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = GRID;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;
      nudgeSelected(dx, dy);
      return;
    }

    // Zoom shortcuts
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      zoomBy(1.15, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
    } else if (isMod && e.key === '-') {
      e.preventDefault();
      zoomBy(1 / 1.15, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
    } else if (isMod && (e.key === '0' || e.key === 'Backspace')) {
      e.preventDefault();
      resetZoom();
    }
  });
});

// -------------------------
// Right Panel — Models
// -------------------------
function renderModelsPanel() {
  const container = el('#modelsList');
  container.innerHTML = '';
  state.models.forEach((m, idx) => {
    const details = document.createElement('details');
    details.dataset.index = String(idx);
    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="model-title">${escapeHtml(m.name || '(unnamed)')}</span>
      <span class="model-id">${escapeHtml(m.api_model || '')}</span>
    `;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'model-grid';
    body.innerHTML = `
      <label>name</label>
      <input data-k="name" value="${escapeAttr(m.name || '')}">
      <label>api_model</label>
      <input data-k="api_model" value="${escapeAttr(m.api_model || '')}">
      <label>api_key <span class="small-note">（例: ${'${ENV.OPENAI_API_KEY}'}）</span></label>
      <input data-k="api_key" value="${escapeAttr(m.api_key || '')}">
      <label>base_url</label>
      <input data-k="base_url" value="${escapeAttr(m.base_url || '')}">

      <details>
        <summary>request_defaults（任意）</summary>
        <div class="model-grid">
          ${defaultsFields(m.request_defaults || {})}
          <div class="small-note">未入力は出力YAMLに含めません。</div>
        </div>
      </details>

      <details>
        <summary>advanced（任意）</summary>
        <div class="model-grid">
          <label>organization</label>
          <input data-kopt="organization" value="${escapeAttr(m.organization || '')}">
          <label>headers（JSON）</label>
          <input data-kopt="headers" placeholder='{"X-Org":"..."}' value='${m.headers ? escapeAttr(JSON.stringify(m.headers)) : ""}'>
        </div>
      </details>

      <div class="model-actions">
        <button class="ghost" data-act="dup" type="button">Duplicate</button>
        <button class="accent" data-act="del" type="button">Delete</button>
      </div>
    `;
    details.appendChild(body);
    container.appendChild(details);

    // events
    body.addEventListener('input', (e) => {
      const t = e.target;
      const i = Number(details.dataset.index);
      const model = state.models[i];
      if (t.matches('[data-k]')) {
        model[t.dataset.k] = t.value;
      } else if (t.matches('[data-kdef]')) {
        const path = t.dataset.kdef;
        model.request_defaults = model.request_defaults || {};
        if (path.includes('.')) {
          const [a, b] = path.split('.');
          model.request_defaults[a] = model.request_defaults[a] || {};
          if (b === 'backoff') {
            try { model.request_defaults[a][b] = JSON.parse(t.value || '{}'); } catch { }
          } else {
            model.request_defaults[a][b] = toMaybeNumber(t.value);
          }
        } else {
          model.request_defaults[path] = toMaybeNumber(t.value);
        }
      } else if (t.matches('[data-kopt]')) {
        const k = t.dataset.kopt;
        if (k === 'headers') {
          try { model.headers = JSON.parse(t.value || 'null'); } catch { }
        } else {
          model[k] = t.value;
        }
      }
      renderNodes(); // モデル名の表示反映
      drawConnections();
    });

    body.addEventListener('click', (e) => {
      const t = e.target;
      const i = Number(details.dataset.index);
      if (t.dataset.act === 'del') {
        state.models.splice(i, 1);
        renderModelsPanel(); renderNodes(); drawConnections();
      } else if (t.dataset.act === 'dup') {
        const cloned = deepClone(state.models[i], (obj) => {
          if (obj && obj.name) obj.name = obj.name + '_copy';
        });
        state.models.splice(i + 1, 0, cloned);
        renderModelsPanel(); renderNodes(); drawConnections();
      }
    });
  });

  el('#btnAddModel').onclick = () => {
    state.models.push({
      name: 'model_' + (state.models.length + 1),
      api_model: '',
      api_key: '${ENV.OPENAI_API_KEY}',
      base_url: 'https://api.openai.com/v1',
      organization: '',
      headers: null,
      request_defaults: {}
    });
    renderModelsPanel(); renderNodes(); drawConnections();
  };
}

function defaultsFields(def) {
  const fields = ['temperature', 'top_p', 'max_tokens', 'timeout_sec'];
  return `
    ${fields.map(k => `
      <label>${k}</label>
      <input data-kdef="${k}" value="${def[k] ?? ''}">
    `).join('')}
    <label>retry.max_attempts</label>
    <input data-kdef="retry.max_attempts" value="${(def.retry && def.retry.max_attempts) || ''}">
    <label>retry.backoff (json)</label>
    <input data-kdef="retry.backoff" placeholder='{"type":"exponential","base":0.5,"max":4.0}' value='${def.retry && def.retry.backoff ? escapeAttr(JSON.stringify(def.retry.backoff)) : ''}'>
  `;
}

// -------------------------
// Block Library (DnD + keyboard)
// -------------------------
function bindLibraryDnD() {
  els('.lib-item').forEach(item => {
    // Drag & drop
    item.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', item.dataset.type);
      ev.dataTransfer.effectAllowed = 'copy';
      canvas.classList.add('drag-over');
    });
    item.addEventListener('dragend', () => {
      canvas.classList.remove('drag-over');
    });

    // Keyboard: Enter/Space で追加（現在の視点の左上に配置）
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        addBlock(item.dataset.type, { x: -viewport.x + 64, y: -viewport.y + 64 });
      }
    });
  });

  canvas.addEventListener('dragover', (ev) => ev.preventDefault());
  canvas.addEventListener('dragenter', () => canvas.classList.add('drag-over'));
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
  canvas.addEventListener('drop', (ev) => {
    ev.preventDefault();
    canvas.classList.remove('drag-over');
    const type = ev.dataTransfer.getData('text/plain');
    const rect = canvas.getBoundingClientRect();
    // ズーム考慮: スクリーン→ワールド変換
    const worldX = (ev.clientX - rect.left) / viewport.s - viewport.x;
    const worldY = (ev.clientY - rect.top) / viewport.s - viewport.y;
    addBlock(type, { x: worldX - 120, y: worldY - 30 });
  });
}

// -------------------------
// Blocks: CRUD + Render
// -------------------------
function addBlock(type, pos) {
  const id = 'b' + state.idCounter++;
  let block;
  if (type === 'ai') {
    block = {
      id, type, title: 'AI Block', exec: guessExec(),
      position: snap(pos),
      model: state.models[0]?.name || '',
      system_prompt: '',
      prompts: [''],
      outputs: [{ name: 'Output_' + id, select: 'full', tag: '', regex: '', join_with: '' }],
      params: {},
      run_if: null,
      on_error: 'fail'
    };
  } else if (type === 'logic') {
    block = {
      id, type, title: 'Logic', exec: guessExec(),
      position: snap(pos),
      name: '',
      op: 'if',
      cond: { equals: ["{IsUrgent}", "yes"] },
      then: 'run',
      else: 'skip',
      operands: undefined,
      list: '',
      parse: '',
      regex_pattern: '',
      var: '',
      drop_empty: undefined,
      where: undefined,
      map: '',
      outputs: [
        { name: 'ShouldWrite', from: 'value' },
        { name: 'IsUrgentBool', from: 'boolean' }
      ],
      run_if: null,
      on_error: 'fail'
    };
  } else if (type === 'python') {
    block = {
      id, type, title: 'Code', exec: guessExec(),
      position: snap(pos),
      py_name: 'Postprocess',
      function: 'render_final',
      inputs: [],
      code_path: './script.py',
      venv_path: './.venv',
      py_outputs: ['Html', 'PlainText'],
      run_if: null,
      on_error: 'fail'
    };
  } else if (type === 'end') {
    block = {
      id, type, title: 'End', exec: guessExec(),
      position: snap(pos),
      reason: '',
      exit_code: 'success',
      final: [{ name: 'Result', value: '{FinalAnswer}' }],
      run_if: null,
      on_error: 'fail'
    };
  } else {
    return;
  }
  state.blocks.push(block);
  renderNodes();
  drawConnections();
}

function guessExec() {
  const max = state.blocks.reduce((m, b) => Math.max(m, b.exec || 0), 0);
  return (max || 0) + 1;
}

let wasDraggingNode = false;

function renderNodes() {
  nodesLayer.innerHTML = '';
  state.blocks.forEach((b) => {
    const node = document.createElement('div');
    node.className = 'node';
    node.id = 'node-' + b.id;
    node.style.left = (b.position?.x ?? 40) + 'px';
    node.style.top = (b.position?.y ?? 40) + 'px';

    node.innerHTML = `
      <div class="node-header" data-drag>
        <div>
          <span class="node-type">${b.type.toUpperCase()}</span>
          <span class="node-title">• ${escapeHtml(b.title || b.name || b.py_name || '')}</span>
        </div>
        <div class="node-badges">
          <span class="badge">exec ${b.exec ?? '-'}</span>
          ${b.type === 'ai' ? `<span class="badge">${escapeHtml(b.model || 'model?')}</span>` : ''}
          <button class="del" title="Delete block" aria-label="Delete block" type="button">✕</button>
        </div>
      </div>
      <div class="node-body">
        <div class="node-io">
          ${renderIoPills(b)}
        </div>
      </div>
    `;

    node.querySelector('.del').onclick = (e) => {
      e.stopPropagation();
      removeBlock(b.id);
      if (selectedBlockId === b.id) selectedBlockId = null;
    };

    node.addEventListener('mousedown', (e) => {
      if (e.target.closest('.del')) return;
      selectedBlockId = b.id;
      els('.node').forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');

      if (e.target.closest('[data-drag]')) {
        startDragNode(e, node, b);
      }
    });

    node.addEventListener('click', (e) => {
      if (e.target.closest('.del')) return;
      if (wasDraggingNode) { wasDraggingNode = false; return; } // ドラッグ直後に編集を開かない
      openEditor(b);
    });

    nodesLayer.appendChild(node);
  });
}

function renderIoPills(b) {
  const inputs = inferredInputs(b);
  const inputsHtml = inputs.map(n => `<span class="io-pill">in:{${escapeHtml(n)}}&hairsp;</span>`).join('');
  let outputs = [];
  if (b.type === 'ai') outputs = (b.outputs || []).map(o => o.name);
  if (b.type === 'logic') outputs = (b.outputs || []).map(o => o.name);
  if (b.type === 'python') outputs = (b.py_outputs || []);
  const outputsHtml = outputs.map(n => `<span class="io-pill">out:${escapeHtml(n)}</span>`).join('');
  return inputsHtml + outputsHtml;
}

function removeBlock(id) {
  const idx = state.blocks.findIndex(b => b.id === id);
  if (idx >= 0) state.blocks.splice(idx, 1);
  autoAssignExecFromEdges();
  autolayoutByExec();
  renderNodes();
  drawConnections();
}

// -------------------------
// Node Dragging (snap-to-grid) + pan/zoom-aware
// -------------------------
function startDragNode(e, node, b) {
  e.preventDefault();
  const cRect = canvas.getBoundingClientRect();
  wasDraggingNode = false;

  // 初期点をワールド座標で記録
  const startWorldMouse = {
    x: (e.clientX - cRect.left) / viewport.s - viewport.x,
    y: (e.clientY - cRect.top) / viewport.s - viewport.y
  };
  const startPos = { x: b.position?.x ?? 0, y: b.position?.y ?? 0 };
  const offset = { x: startWorldMouse.x - startPos.x, y: startWorldMouse.y - startPos.y };

  function onMove(ev) {
    wasDraggingNode = true;
    const worldMouse = {
      x: (ev.clientX - cRect.left) / viewport.s - viewport.x,
      y: (ev.clientY - cRect.top) / viewport.s - viewport.y
    };
    b.position = snap({ x: worldMouse.x - offset.x, y: worldMouse.y - offset.y });
    node.style.left = b.position.x + 'px';
    node.style.top = b.position.y + 'px';
    raf(drawConnections);
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    drawConnections();
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function nudgeSelected(dx, dy) {
  const b = state.blocks.find(x => x.id === selectedBlockId);
  if (!b) return;
  const nx = (b.position?.x ?? 0) + dx;
  const ny = (b.position?.y ?? 0) + dy;
  b.position = snap({ x: nx, y: ny });
  const node = el('#node-' + b.id);
  if (node) {
    node.style.left = b.position.x + 'px';
    node.style.top = b.position.y + 'px';
    els('.node').forEach(n => n.classList.remove('selected'));
    node.classList.add('selected');
  }
  drawConnections();
}

// -------------------------
// Canvas Panning
// -------------------------
function bindCanvasPanning() {
  let spaceDown = false;
  let panning = false;
  let start = { x: 0, y: 0 };
  let origin = { x: 0, y: 0 };

  const startPan = (ev) => {
    panning = true;
    start = { x: ev.clientX, y: ev.clientY };
    origin = { ...viewport };
    canvas.classList.add('panning');
    ev.preventDefault();
  };
  const movePan = (ev) => {
    if (!panning) return;
    viewport.x = origin.x + (ev.clientX - start.x) / viewport.s;
    viewport.y = origin.y + (ev.clientY - start.y) / viewport.s;
    applyViewport();
  };
  const endPan = () => {
    if (!panning) return;
    panning = false;
    canvas.classList.remove('panning');
    raf(drawConnections);
  };

  // Space + 左ドラッグ
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isEditableTarget(e.target)) {
      spaceDown = true;
      canvas.classList.add('pannable');
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      canvas.classList.remove('pannable');
      endPan();
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    // 背景またはスペースキー押下時にパン開始（中ボタンでも可）
    if (e.button === 1 || (spaceDown && e.button === 0)) {
      if (e.target.closest('.node')) return;
      startPan(e);
      window.addEventListener('mousemove', movePan);
      window.addEventListener('mouseup', () => {
        window.removeEventListener('mousemove', movePan);
        endPan();
      }, { once: true });
    }
  });

  // ホイール/トラックパッドでパン（Ctrl/⌘はズームで使う）
  canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) return; // ズームは別ハンドラ
    e.preventDefault();
    viewport.x -= e.deltaX / viewport.s;
    viewport.y -= e.deltaY / viewport.s;
    applyViewport();
  }, { passive: false });
}

// -------------------------
// Zooming
// -------------------------
function bindZooming() {
  canvas.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * 0.0015); // 滑らかズーム
    zoomBy(factor, anchor);
  }, { passive: false });
}

function zoomBy(factor, anchorScreen) {
  const newS = clamp(viewport.s * factor, MIN_ZOOM, MAX_ZOOM);
  setScale(newS, anchorScreen);
}

function resetZoom() {
  setScale(1, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
}

function fitToContent() {
  if (!state.blocks.length) { resetZoom(); return; }
  const b = contentBounds();
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const margin = 60; // px (screen)
  const sFit = clamp(Math.min((W - 2 * margin) / Math.max(b.w, 1), (H - 2 * margin) / Math.max(b.h, 1)), MIN_ZOOM, MAX_ZOOM);
  viewport.s = sFit;
  // 中央配置（ワールド→スクリーン: (x + vx)*s ）
  viewport.x = (W / (2 * sFit)) - (b.x + b.w / 2);
  viewport.y = (H / (2 * sFit)) - (b.y + b.h / 2);
  applyViewport();
  raf(drawConnections);
}

function setScale(newScale, anchorScreen = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }) {
  const s0 = viewport.s;
  const s1 = clamp(newScale, MIN_ZOOM, MAX_ZOOM);
  if (Math.abs(s1 - s0) < 1e-4) return;

  // アンカーのワールド座標を維持するように平行移動を補正
  const worldAtAnchor = {
    x: anchorScreen.x / s0 - viewport.x,
    y: anchorScreen.y / s0 - viewport.y
  };
  viewport.s = s1;
  viewport.x = anchorScreen.x / s1 - worldAtAnchor.x;
  viewport.y = anchorScreen.y / s1 - worldAtAnchor.y;

  applyViewport();
  raf(drawConnections);
}

function mountZoomHud() {
  const hud = document.createElement('div');
  hud.className = 'zoom-hud glass';
  hud.innerHTML = `
    <button id="zoomOut" class="ghost" title="Zoom Out">−</button>
    <div class="pct" id="zoomPct">100%</div>
    <button id="zoomIn" class="ghost" title="Zoom In">＋</button>
    <button id="zoomFit" class="primary" title="Fit to Content">Fit</button>
    <button id="zoomReset" class="ghost" title="Reset Zoom">100%</button>
  `;
  canvas.appendChild(hud);

  el('#zoomOut', hud).onclick = () => zoomBy(1 / 1.15, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
  el('#zoomIn', hud).onclick = () => zoomBy(1.15, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
  el('#zoomFit', hud).onclick = () => fitToContent();
  el('#zoomReset', hud).onclick = () => resetZoom();
  updateZoomHud();
}

function updateZoomHud() {
  const pct = Math.round(viewport.s * 100);
  const box = el('#zoomPct');
  if (box) box.textContent = `${pct}%`;
}

// -------------------------
// Import / Export & Top actions
// -------------------------
function bindGlobalButtons() {
  el('#btnGenerate').onclick = () => {
    try {
      const yaml = toYAML(state);
      yamlPreview.value = yaml;
      if (previewWrap && !previewWrap.open) previewWrap.open = true;
      downloadText('mabel.yaml', yaml);
    } catch (err) {
      console.error('YAML generation error:', err);
      alert('YAMLの生成に失敗しました。詳細はコンソールを確認してください。\n\nエラー: ' + err.message);
      yamlPreview.value = '# エラー: YAML生成に失敗しました\n# ' + err.message;
      if (previewWrap && !previewWrap.open) previewWrap.open = true;
    }
  };
  el('#btnClear').onclick = () => {
    if (!confirm('Clear all models & blocks?')) return;
    state.models = [];
    state.blocks = [];
    state.idCounter = 1;
    renderModelsPanel();
    renderNodes();
    drawConnections();
    yamlPreview.value = '';
  };
  const btnAutoLayout = el('#btnAutoLayout');
  if (btnAutoLayout) {
    btnAutoLayout.onclick = () => {
      autolayoutByExec();
      renderNodes();
      drawConnections();
    };
  }
}

function bindImport() {
  el('#btnImport').onclick = () => fileInput.click();
  fileInput.addEventListener('change', async (e) => {
    const f = fileInput.files[0];
    if (!f) return;
    const text = await f.text();
    await importYamlText(text);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(ev =>
    importDrop.addEventListener(ev, (e) => { e.preventDefault(); importDrop.classList.add('drag'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    importDrop.addEventListener(ev, (e) => { e.preventDefault(); importDrop.classList.remove('drag'); })
  );
  importDrop.addEventListener('drop', async (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const text = await f.text();
    await importYamlText(text);
  });
}

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
    <p class="small-note">Detected inputs from <span class="kbd">{...}</span>: ${detected.map(x => `<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</p>
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
        ${(b.outputs || []).map((o, i) => aiOutputRow(o, i)).join('')}
        <button type="button" class="accent" id="btnAddOut">+ add output</button>
      </fieldset>
    </details>

    <details class="full"><summary>params（任意・モデルdefaultsを上書き）</summary>
      <div class="form-grid">
        ${['temperature', 'top_p', 'max_tokens'].map(k => `
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
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
        </select>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddOut') {
      const fieldset = el('#aiOutputs', wrap);
      const o = { name: 'Out_' + Math.random().toString(36).slice(2, 6), select: 'full', tag: '', regex: '', join_with: '' };
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
        <option value="full" ${o.select === 'full' ? 'selected' : ''}>full</option>
        <option value="tag" ${o.select === 'tag' ? 'selected' : ''}>tag</option>
        <option value="regex" ${o.select === 'regex' ? 'selected' : ''}>regex</option>
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
    const rJoin = outRows[i + 1];
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
      <option value="if" ${b.op === 'if' ? 'selected' : ''}>if</option>
      <option value="and" ${b.op === 'and' ? 'selected' : ''}>and</option>
      <option value="or" ${b.op === 'or' ? 'selected' : ''}>or</option>
      <option value="not" ${b.op === 'not' ? 'selected' : ''}>not</option>
      <option value="for" ${b.op === 'for' ? 'selected' : ''}>for</option>
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
          <option value="lines" ${b.parse === 'lines' ? 'selected' : ''}>lines</option>
          <option value="csv" ${b.parse === 'csv' ? 'selected' : ''}>csv</option>
          <option value="json" ${b.parse === 'json' ? 'selected' : ''}>json</option>
          <option value="regex" ${b.parse === 'regex' ? 'selected' : ''}>regex</option>
        </select>
        <label>regex_pattern（parse=regex時）</label>
        <input data-k="regex_pattern" class="full" value="${escapeAttr(b.regex_pattern || '')}">
        <label>var（既定: item）</label>
        <input data-k="var" value="${escapeAttr(b.var || '')}">
        <label>drop_empty</label>
        <select data-k="drop_empty">
          <option value="">(default: true)</option>
          <option value="true" ${b.drop_empty === true ? 'selected' : ''}>true</option>
          <option value="false" ${b.drop_empty === false ? 'selected' : ''}>false</option>
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
        ${(b.outputs || []).map(o => logicOutputRow(o)).join('')}
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
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
        </select>
      </div>
    </details>
  `;

  wrap.addEventListener('click', (e) => {
    if (e.target.id === 'btnAddLogicOut') {
      const fs = el('#logicOutputs', wrap);
      fs.insertAdjacentHTML('beforeend', logicOutputRow({ name: 'Out_' + Math.random().toString(36).slice(2, 6), from: 'boolean' }));
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
        <option value="boolean" ${o.from === 'boolean' ? 'selected' : ''}>boolean</option>
        <option value="value" ${o.from === 'value' ? 'selected' : ''}>value</option>
        <option value="join" ${o.from === 'join' ? 'selected' : ''}>join</option>
        <option value="count" ${o.from === 'count' ? 'selected' : ''}>count</option>
        <option value="any" ${o.from === 'any' ? 'selected' : ''}>any</option>
        <option value="all" ${o.from === 'all' ? 'selected' : ''}>all</option>
        <option value="first" ${o.from === 'first' ? 'selected' : ''}>first</option>
        <option value="last" ${o.from === 'last' ? 'selected' : ''}>last</option>
        <option value="list" ${o.from === 'list' ? 'selected' : ''}>list</option>
      </select>
      <select data-o="source">
        <option value="" ${!o.source ? 'selected' : ''}>(default)</option>
        <option value="raw" ${o.source === 'raw' ? 'selected' : ''}>raw</option>
        <option value="filtered" ${o.source === 'filtered' ? 'selected' : ''}>filtered</option>
        <option value="mapped" ${o.source === 'mapped' ? 'selected' : ''}>mapped</option>
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
    const r2 = rows[i + 1];
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
    <div class="small-note full">利用可能な出力: ${allOutputNames().map(x => `<span class="kbd">${escapeHtml(x)}</span>`).join(' ') || '(none)'}</div>

    <label>code_path</label>
    <input class="full" data-k="code_path" value="${escapeAttr(b.code_path || '')}">
    <label>venv_path</label>
    <input class="full" data-k="venv_path" value="${escapeAttr(b.venv_path || '')}">

    <details class="full"><summary>outputs（必須）</summary>
      <fieldset class="inline-list" id="pyOutputs">
        ${(b.py_outputs || []).map(o => `
          <div class="row python">
            <input placeholder="output name" data-o="py_out" value="${escapeAttr(o)}">
            <div></div>
            <button type="button" class="del" data-act="delPyOut" aria-label="Delete output">✕</button>
          </div>
        `).join('')}
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
          <option value="fail" ${b.on_error === 'fail' ? 'selected' : ''}>fail</option>
          <option value="continue" ${b.on_error === 'continue' ? 'selected' : ''}>continue</option>
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
  b.inputs = el('[data-k="inputs"]', editorBody).value.split(',').map(s => s.trim()).filter(Boolean);
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
    if (b.type === 'ai') (b.outputs || []).forEach(o => { if (o.name) names.push(o.name); });
    if (b.type === 'logic') (b.outputs || []).forEach(o => { if (o.name) names.push(o.name); });
    if (b.type === 'python') (b.py_outputs || []).forEach(n => { if (n) names.push(n); });
  });
  return names;
}
