// =========================
/* MABEL Studio Frontend (YAML Import + wiring & UI refined)
 * 修正点:
 *  - Unicode対応のプレースホルダ抽出
 *  - 名前正規化によるマッチング強化
 *  - Save時の安定した自動配線（drawConnectionsの改善）
 *  - AutoLayoutのバランス調整（列ごと垂直センタリング）
 *  - UI微調整（キーボード操作/ラベル/ホバー情報）
 *  - ★ v1.1対応: logic.for / end ブロックの編集・配線・YAML出力に対応
 *  - ★ 追加: キャンバスのパン（Space+Drag / 中ボタン / ホイール）対応
 *  - ★ 追加: Save/Import/削除時に配線からexecを自動算出（トポロジカル順）
 *  - ★ 修正: 出力行の削除が1行だけ残る不具合を解消（AI/LOGIC）
 *
 * 2025-09 追加改修（UI/UX安定化）
 *  - パン時にノードとワイヤを同じtransformで移動（置いていかれ解消）
 *  - drawConnections(): ビューポートに依存しないワールド座標で計算（描画範囲超過での消失を防止）
 *  - SVGをoverflow:visibleに、ベクター線をnon-scaling-stroke化
 *  - ★ 新規: ズーム（Ctrl/⌘ + ホイール/ピンチ・HUD: − / 100% / ＋ / Fit）
 *  - AutoLayout/ドラッグ/ドロップ/ホイールパンはズーム倍率を考慮
 *  - Helpポップオーバーの可読性を改善（不透明化）
 */
// =========================

/**
 * State structure:
 *  models: [{
 *    name, api_model, api_key, base_url, organization?, headers?, request_defaults:{...}
 *  }]
 *  blocks: [{
 *    id, type:'ai'|'logic'|'python'|'end', title, exec, position:{x,y} | null,
 *    // ai
 *    model, system_prompt, prompts:[], outputs:[{name,select,tag,regex,join_with}],
 *    params:{}, run_if:null, on_error:'fail',
 *    // logic
 *    name?, op, cond, then, else, operands?,
 *    // for専用
 *    list, parse, regex_pattern, var, drop_empty, where, map,
 *    outputs:[{name, from, test?, source?, join_with?, limit?, offset?}],
 *    run_if?, on_error?,
 *    // python
 *    py_name, function, inputs:[], code_path, venv_path, py_outputs:[], run_if?, on_error?,
 *    // end
 *    reason?, exit_code?, final:[{name,value}], run_if?, on_error?
 *  }]
 */

const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  models: [],
  blocks: [],
  idCounter: 1,
};

const canvas = el('#canvas');
const nodesLayer = el('#nodes');
const wiresSvg = el('#wires');
const editorModal = el('#editorModal');
const editorBody = el('#editorBody');
const editorTitle = el('#editorTitle');
const editorForm = el('#editorForm');
const yamlPreview = el('#yamlPreview');
const previewWrap = el('#previewWrap');
const importDrop = el('#importDrop');
const fileInput = el('#yamlFile');

const GRID = 24; // snap-to-grid size
const EDGE_STROKE = 'url(#edgeGradient)';

let selectedBlockId = null;

// ---- Viewport (pan & zoom) ----
const viewport = { x: 0, y: 0, s: 1 };
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

function applyViewport() {
  // CSS transform は右から左に適用されるため、平行移動量はスケールを掛けて与える
  const tx = viewport.x * viewport.s;
  const ty = viewport.y * viewport.s;
  const t = `translate(${tx}px, ${ty}px) scale(${viewport.s})`;
  nodesLayer.style.transform = t;
  wiresSvg.style.transform = t;
  updateZoomHud();
}

// draw throttling
const raf = (fn => {
  let req = 0;
  return () => {
    if (req) return;
    req = requestAnimationFrame(() => { req = 0; fn(); });
  };
})();

// -------------------------
// Initialization
// -------------------------
document.addEventListener('DOMContentLoaded', () => {
  bootstrapDefaults();
  bindLibraryDnD();
  bindGlobalButtons();
  bindImport();
  bindCanvasPanning();
  bindZooming();         // ★ ズーム操作
  mountZoomHud();        // ★ HUD
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
    if (selectedBlockId && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
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
      zoomBy(1.15, {x: canvas.clientWidth/2, y: canvas.clientHeight/2});
    } else if (isMod && e.key === '-') {
      e.preventDefault();
      zoomBy(1/1.15, {x: canvas.clientWidth/2, y: canvas.clientHeight/2});
    } else if (isMod && (e.key === '0' || e.key === 'Backspace')) {
      e.preventDefault();
      resetZoom();
    }
  });
});

function bootstrapDefaults() {
  state.models = [
    {
      name: 'planner',
      api_model: 'gpt-4o-mini',
      api_key: '${ENV.OPENAI_API_KEY}',
      base_url: 'https://api.openai.com/v1',
      organization: '',
      headers: null,
      request_defaults: { temperature: 0.0, max_tokens: 800 }
    },
    {
      name: 'writer',
      api_model: 'gpt-4.1',
      api_key: '${ENV.OPENAI_API_KEY}',
      base_url: 'https://api.openai.com/v1',
      organization: '',
      headers: null,
      request_defaults: { temperature: 0.3, top_p: 0.95, max_tokens: 1200 }
    }
  ];
  syncSvgToCanvas();
}

function syncSvgToCanvas() {
  wiresSvg.setAttribute('width', canvas.clientWidth);
  wiresSvg.setAttribute('height', canvas.clientHeight);
  wiresSvg.setAttribute('viewBox', `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
  // クリップはCSSで解除（overflow:visible）
}

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
          const [a,b] = path.split('.');
          model.request_defaults[a] = model.request_defaults[a] || {};
          if (b === 'backoff') {
            try { model.request_defaults[a][b] = JSON.parse(t.value || '{}'); } catch {}
          } else {
            model.request_defaults[a][b] = toMaybeNumber(t.value);
          }
        } else {
          model.request_defaults[path] = toMaybeNumber(t.value);
        }
      } else if (t.matches('[data-kopt]')) {
        const k = t.dataset.kopt;
        if (k === 'headers') {
          try { model.headers = JSON.parse(t.value || 'null'); } catch {}
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
  const fields = ['temperature','top_p','max_tokens','timeout_sec'];
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
    // ★ ズーム考慮: スクリーン→ワールド変換
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

function nudgeSelected(dx, dy){
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

function snap(p){ return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }; }

// -------------------------
// Canvas Panning
// -------------------------
function bindCanvasPanning() {
  let spaceDown = false;
  let panning = false;
  let start = { x:0, y:0 };
  let origin = { x:0, y:0 };

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
  setScale(1, { x: canvas.clientWidth/2, y: canvas.clientHeight/2 });
}

function fitToContent() {
  if (!state.blocks.length) { resetZoom(); return; }
  const b = contentBounds();
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const margin = 60; // px (screen)
  const sFit = clamp(Math.min((W - 2*margin) / Math.max(b.w, 1), (H - 2*margin) / Math.max(b.h, 1)), MIN_ZOOM, MAX_ZOOM);
  viewport.s = sFit;
  // 中央配置（ワールド→スクリーン: (x + vx)*s ）
  viewport.x = (W/(2*sFit)) - (b.x + b.w/2);
  viewport.y = (H/(2*sFit)) - (b.y + b.h/2);
  applyViewport();
  raf(drawConnections);
}

function setScale(newScale, anchorScreen = {x: canvas.clientWidth/2, y: canvas.clientHeight/2}) {
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

  el('#zoomOut', hud).onclick = () => zoomBy(1/1.15, {x: canvas.clientWidth/2, y: canvas.clientHeight/2});
  el('#zoomIn', hud).onclick = () => zoomBy(1.15, {x: canvas.clientWidth/2, y: canvas.clientHeight/2});
  el('#zoomFit', hud).onclick = () => fitToContent();
  el('#zoomReset', hud).onclick = () => resetZoom();
  updateZoomHud();
}

function updateZoomHud() {
  const pct = Math.round(viewport.s * 100);
  const box = el('#zoomPct');
  if (box) box.textContent = `${pct}%`;
}

function contentBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.blocks.forEach(b => {
    const node = el('#node-' + b.id);
    const w = node?.offsetWidth ?? 300;
    const h = node?.offsetHeight ?? 160;
    const x = b.position?.x ?? 0;
    const y = b.position?.y ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  if (!isFinite(minX)) return { x:0, y:0, w:1, h:1 };
  return { x:minX, y:minY, w:Math.max(1, maxX-minX), h:Math.max(1, maxY-minY) };
}

// -------------------------
// Connections (wiring)
// -------------------------

/** 名称を正規化（NFKC + trim + 連続空白の単一化 + 小文字化） */
function normKey(name){
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 端子ラベルの可読版（UI表示用に元の名称を返す） */
function prettyName(name){
  return String(name ?? '').trim();
}

function drawConnections() {
  clearWires();

  const edges = computeEdges();
  edges.forEach((e) => {
    const fromEl = el('#node-' + e.from);
    const toEl = el('#node-' + e.to);
    if (!fromEl || !toEl) return;

    // ★ ビューポート非依存：ワールド座標で端点を算出
    const fromBlock = state.blocks.find(b => b.id === e.from);
    const toBlock = state.blocks.find(b => b.id === e.to);
    if (!fromBlock || !toBlock) return;

    const fr = {
      x: (fromBlock.position?.x ?? 0),
      y: (fromBlock.position?.y ?? 0),
      w: fromEl.offsetWidth,
      h: fromEl.offsetHeight
    };
    const tr = {
      x: (toBlock.position?.x ?? 0),
      y: (toBlock.position?.y ?? 0),
      w: toEl.offsetWidth,
      h: toEl.offsetHeight
    };

    const x1 = fr.x + fr.w - 6;
    const y1 = fr.y + fr.h / 2;
    const x2 = tr.x + 6;
    const y2 = tr.y + tr.h / 2;

    const dx = Math.max(40, Math.abs(x2 - x1) * 0.35);
    const d = `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', EDGE_STROKE);
    p.setAttribute('marker-end', 'url(#arrow)');
    p.setAttribute('fill', 'none');
    p.setAttribute('opacity', '1');
    p.setAttribute('class', 'edge');
    p.setAttribute('filter', 'url(#glow)');
    p.setAttribute('vector-effect', 'non-scaling-stroke');

    // ホバーで参照名
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = prettyName(e.label);
    p.appendChild(title);

    wiresSvg.appendChild(p);
  });
}

function clearWires(){
  els('path.edge', wiresSvg).forEach(n => n.remove());
}

function computeEdges() {
  const edges = [];
  const producers = new Map(); // key(norm) -> { name, ids[] }

  // Collect outputs (producers)
  state.blocks.forEach(b => {
    const outs = (b.type === 'ai') ? (b.outputs||[]).map(o=>o.name)
              : (b.type === 'logic') ? (b.outputs||[]).map(o=>o.name)
              : (b.type === 'python') ? (b.py_outputs||[]) : [];
    outs.forEach(n => {
      const display = (n || '').trim();
      if (!display) return;
      const k = normKey(display);
      const cur = producers.get(k) || { name: display, ids: [] };
      if (!cur.ids.includes(b.id)) cur.ids.push(b.id);
      producers.set(k, cur);
    });
  });

  // Link inputs from placeholders / python inputs
  state.blocks.forEach(target => {
    inferredInputs(target).forEach(inpRaw => {
      const k = normKey(inpRaw);
      const prod = producers.get(k);
      if (!prod) return;
      prod.ids.forEach(pid => {
        if (pid !== target.id) edges.push({ from: pid, to: target.id, label: inpRaw });
      });
    });
  });

  return edges;
}

/** 入力の推定：{...} をUnicode対応で抽出。Pythonは inputs を使用。 */
function inferredInputs(block) {
  const set = new Set();
  const scan = (txt) => {
    if (!txt || typeof txt !== 'string') return;
    // Unicode 対応
    const re = /\{\s*([^{}]+?)\s*\}/gu;
    for (const m of txt.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      const cleaned = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (cleaned) set.add(cleaned);
    }
  };

  if (block.type === 'ai') {
    scan(block.system_prompt || '');
    (block.prompts || []).forEach(scan);
    if (block.run_if && typeof block.run_if === 'object') scan(JSON.stringify(block.run_if));
  } else if (block.type === 'logic') {
    if ((block.op || 'if') === 'for') {
      scan(block.list || '');
      if (block.where) scan(JSON.stringify(block.where));
      scan(block.map || '');
      const varName = (block.var || 'item').normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (varName) set.delete(varName);
      if (block.run_if && typeof block.run_if === 'object') scan(JSON.stringify(block.run_if));
    } else {
      scan(JSON.stringify(block.cond || ''));
      scan(block.then || '');
      scan(block.else || '');
      if (block.operands) scan(JSON.stringify(block.operands));
      if (block.run_if && typeof block.run_if === 'object') scan(JSON.stringify(block.run_if));
    }
  } else if (block.type === 'python') {
    // inputsは配列またはオブジェクトの可能性がある
    const inputs = block.inputs || [];
    const inputArray = Array.isArray(inputs) ? inputs : Object.values(inputs);
    inputArray.forEach(name => {
      if (name && typeof name === 'string') {
        const cleaned = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
        if (cleaned) set.add(cleaned);
      }
    });
    if (block.run_if) scan(JSON.stringify(block.run_if));
  } else if (block.type === 'end') {
    scan(block.reason || '');
    if (Array.isArray(block.final)) block.final.forEach(f => scan(f.value || ''));
    if (block.run_if) scan(JSON.stringify(block.run_if));
  }
  return Array.from(set);
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

// -------------------------
// Import / Export & Top actions
// -------------------------
function bindGlobalButtons() {
  el('#btnGenerate').onclick = () => {
    const yaml = toYAML(state);
    yamlPreview.value = yaml;
    if (previewWrap && !previewWrap.open) previewWrap.open = true;
    downloadText('mabel.yaml', yaml);
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

  ['dragenter','dragover'].forEach(ev =>
    importDrop.addEventListener(ev, (e) => { e.preventDefault(); importDrop.classList.add('drag'); })
  );
  ['dragleave','drop'].forEach(ev =>
    importDrop.addEventListener(ev, (e) => { e.preventDefault(); importDrop.classList.remove('drag'); })
  );
  importDrop.addEventListener('drop', async (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const text = await f.text();
    await importYamlText(text);
  });
}

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

    yamlPreview.value = text;
    if (previewWrap && !previewWrap.open) previewWrap.open = true;

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

/** 列ごとに垂直センタリング（ズーム倍率を反映） */
function autolayoutByExec() {
  const cRect = canvas.getBoundingClientRect();
  const worldH = cRect.height / viewport.s; // ★ズーム考慮
  const marginX = 80;
  const marginY = 30;
  const colW = 360; // node width + spacing
  const rowH = 170;

  const execs = Array.from(new Set(state.blocks.map(b => b.exec || 1))).sort((a,b)=>a-b);
  const xMap = new Map();
  execs.forEach((ex, i) => xMap.set(ex, 40 + i * (colW + marginX)));

  const byExec = new Map();
  execs.forEach(ex => byExec.set(ex, state.blocks.filter(b => (b.exec||1) === ex)));

  byExec.forEach((list, ex) => {
    const n = list.length;
    const colHeight = n * rowH + (n - 1) * marginY;
    const startY = Math.max(32, Math.round((worldH - colHeight) / 2));
    list.forEach((b, idx) => {
      const x = xMap.get(ex);
      const y = startY + idx * (rowH + marginY);
      b.position = snap({x, y});
    });
  });
}

// -------------------------
// exec 自動割当（配線 -> トポロジカル順）
// -------------------------
function autoAssignExecFromEdges() {
  const edges = computeEdges();
  const ids = state.blocks.map(b => b.id);
  const outMap = new Map(); // id -> neighbors[]
  const indeg = new Map();  // id -> count
  const level = new Map();  // id -> exec level (1-based)

  ids.forEach(id => { outMap.set(id, []); indeg.set(id, 0); });

  edges.forEach(e => {
    if (!outMap.has(e.from) || !indeg.has(e.to)) return;
    outMap.get(e.from).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  });

  const q = [];
  ids.forEach(id => {
    if ((indeg.get(id) || 0) === 0) { q.push(id); level.set(id, 1); }
  });

  const processed = new Set();
  while (q.length) {
    const id = q.shift();
    processed.add(id);
    const l = level.get(id) || 1;
    (outMap.get(id) || []).forEach(nid => {
      level.set(nid, Math.max(level.get(nid) || 1, l + 1));
      indeg.set(nid, (indeg.get(nid) || 0) - 1);
      if ((indeg.get(nid) || 0) === 0) q.push(nid);
    });
  }

  if (processed.size !== ids.length) {
    const remaining = ids.filter(id => !processed.has(id));
    remaining.forEach(id => {
      const preds = edges.filter(e => e.to === id).map(e => e.from);
      let maxL = 0;
      preds.forEach(pid => { maxL = Math.max(maxL, level.get(pid) || 1); });
      level.set(id, maxL + 1 || 1);
    });
  }

  state.blocks.forEach(b => {
    const newEx = level.get(b.id) || 1;
    b.exec = newEx;
  });
}

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
// Utilities
// -------------------------
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g,'&#10;'); }
function safeParseJson(s, fallback){
  try{ return JSON.parse(s); } catch{ return fallback; }
}
function toMaybeNumber(v){
  if (v === '' || v === null || v === undefined) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}
function deepClone(obj, mutateFn){
  const x = JSON.parse(JSON.stringify(obj));
  if (mutateFn) mutateFn(x);
  return x;
}
function isEditableTarget(t){
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || t.isContentEditable;
}
