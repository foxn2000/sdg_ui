// =========================
// MABEL Studio Frontend (ui.init: 初期化/トップボタン/インポート/パン・ズーム/HUD/ショートカット)
// - 依存: app.core.js（state, DOM参照, viewport, utils, snap, applyViewport, raf, bootstrapDefaults, syncSvgToCanvas）
//         app.graph.js（drawConnections, contentBounds, autolayoutByExec, autoAssignExecFromEdges, inferredInputs）
//         ui.models（renderModelsPanel）, ui.nodes（bindLibraryDnD, renderNodes, nudgeSelected, removeBlock）, ui.editor（openEditor）
// - 提供: 初期化エントリ、パン/ズーム、HUD、各種バインド関数
// =========================

// -------------------------
// Initialization
// -------------------------
document.addEventListener('DOMContentLoaded', () => {
  bootstrapDefaults();
  bindLibraryDnD();
  bindGlobalButtons();
  bindImport();
  bindModelTools();
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

// -------------------------
// Model Tools (Save/Load/Reset/Download)
// -------------------------
const LS_MODELS_KEY = 'mabel.models.json.v1';

function bindModelTools() {
  const btnSave = document.getElementById('btnModelsSaveLocal');
  const btnLoad = document.getElementById('btnModelsLoadLocal');
  const btnReset = document.getElementById('btnModelsReset');
  const btnDownload = document.getElementById('btnModelsDownloadYAML');

  if (btnSave) btnSave.onclick = () => {
    try {
      localStorage.setItem(LS_MODELS_KEY, JSON.stringify(state.models || []));
      alert('Models saved to browser storage.');
    } catch (e) {
      console.error(e);
      alert('Failed to save models to browser storage.');
    }
  };

  if (btnLoad) btnLoad.onclick = () => {
    try {
      const raw = localStorage.getItem(LS_MODELS_KEY);
      if (!raw) { alert('No saved models in browser storage.'); return; }
      const parsed = JSON.parse(raw);
      const models = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.models) ? parsed.models : []);
      if (!Array.isArray(models)) { alert('Invalid models data in storage.'); return; }
      state.models = models;
      renderModelsPanel();
      renderNodes();
      drawConnections();
      alert('Models loaded from browser storage.');
    } catch (e) {
      console.error(e);
      alert('Failed to load models from browser storage.');
    }
  };

  if (btnReset) btnReset.onclick = () => {
    if (!confirm('モデル設定をデフォルトに戻しますか？（ブロックには影響しません）')) return;
    const keepBlocks = state.blocks;
    bootstrapDefaults(); // resets models to defaults
    state.blocks = keepBlocks; // keep blocks as-is
    renderModelsPanel();
    renderNodes();
    drawConnections();
  };

  if (btnDownload) btnDownload.onclick = () => {
    const yaml = toYAMLModels(state.models || []);
    downloadText('models.yaml', yaml);
  };
}
