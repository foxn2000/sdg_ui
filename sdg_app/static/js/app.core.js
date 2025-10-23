// =========================
/* MABEL Studio Frontend (core: state, DOM refs, viewport, utils)
 * - 4分割: core / graph / yaml / ui
 * - 本ファイル: グローバル状態、DOM参照、ビューポート基盤、ユーティリティを提供
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

// DOM helpers
const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Global state
const state = {
  models: [],
  blocks: [],
  idCounter: 1,
};

// DOM refs
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

// Constants
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
  if (nodesLayer) nodesLayer.style.transform = t;
  if (wiresSvg) wiresSvg.style.transform = t;
  updateZoomHud && updateZoomHud();
}

// draw throttling
const raf = (fn => {
  let req = 0;
  return () => {
    if (req) return;
    req = requestAnimationFrame(() => { req = 0; fn(); });
  };
})();

// Defaults/bootstrap
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
  if (!wiresSvg || !canvas) return;
  wiresSvg.setAttribute('width', canvas.clientWidth);
  wiresSvg.setAttribute('height', canvas.clientHeight);
  wiresSvg.setAttribute('viewBox', `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
  // クリップはCSSで解除（overflow:visible）
}

// -------------------------
// Utilities
// -------------------------
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&','<':'<','>':'>',"'":'&#39;','"':'"'}[c])); }
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

function snap(p){
  return {
    x: Math.round(p.x / GRID) * GRID,
    y: Math.round(p.y / GRID) * GRID
  };
}
