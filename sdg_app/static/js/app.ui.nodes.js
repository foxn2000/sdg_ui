// =========================
// MABEL Studio Frontend (ui.nodes: ブロック追加/描画/ドラッグ/削除, ライブラリDnD)
// - 依存: app.core.js（state, DOM, utils, viewport, GRID, raf）, app.graph.js（drawConnections, autoAssignExecFromEdges, autolayoutByExec, inferredInputs）
// - 提供: bindLibraryDnD, addBlock, renderNodes, removeBlock, nudgeSelected
// =========================

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
  if (type === 'start') {
    block = {
      id, type, title: 'Start', exec: 0,
      position: snap(pos),
      outputs: ['UserInput']
    };
  } else if (type === 'ai') {
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
  if (b.type === 'start') outputs = (b.outputs || []);
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
