// =========================
/* MABEL Studio Frontend (graph: wiring, layout, exec/topology, input inference)
 * - 本ファイル: 配線描画、入出力推論、トポロジカル順によるexec割当、レイアウト関連
 */
// =========================

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
  // SVGサイズが未同期/キャンバス未レイアウト時の描画抜け対策
  if (typeof syncSvgToCanvas === 'function') syncSvgToCanvas();
  if (!canvas || canvas.clientWidth < 2 || canvas.clientHeight < 2) {
    if (typeof raf === 'function') raf(drawConnections);
    return;
  }

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
      w: Math.max(1, fromEl.offsetWidth || 260),
      h: Math.max(1, fromEl.offsetHeight || 160)
    };
    const tr = {
      x: (toBlock.position?.x ?? 0),
      y: (toBlock.position?.y ?? 0),
      w: Math.max(1, toEl.offsetWidth || 260),
      h: Math.max(1, toEl.offsetHeight || 160)
    };

    const x1 = fr.x + fr.w - 6;
    const y1 = fr.y + fr.h / 2;
    const x2 = tr.x + 6;
    const y2 = tr.y + tr.h / 2;

    // 横方向と縦方向の距離を計算
    const horizontalDist = x2 - x1;
    const verticalDist = Math.abs(y2 - y1);
    const dx = Math.max(40, Math.abs(horizontalDist) * 0.35);
    
    // Y座標が近い場合（横一直線に近い）は制御点を少し上にずらして線を見えるようにする
    let d;
    if (verticalDist < 10) {
      // ほぼ横一直線の場合：制御点を少し上にずらす
      const offset = 15; // わずかに上にずらす
      const cy1 = y1 - offset;
      const cy2 = y2 - offset;
      d = `M ${x1} ${y1} C ${x1+dx} ${cy1}, ${x2-dx} ${cy2}, ${x2} ${y2}`;
    } else {
      // 通常のベジェ曲線
      d = `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
    }
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
    const outs = (b.type === 'start') ? (b.outputs||[])
              : (b.type === 'ai') ? (b.outputs||[]).map(o=>o.name)
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
    const op = block.op || 'if';
    
    if (op === 'for') {
      scan(block.list || '');
      if (block.where) scan(JSON.stringify(block.where));
      scan(block.map || '');
      const varName = (block.var || 'item').normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (varName) set.delete(varName);
    } else if (op === 'set') {
      // set演算子: value フィールドをスキャン
      if (block.value !== undefined) scan(JSON.stringify(block.value));
    } else if (op === 'let') {
      // let演算子: bindings と body をスキャン
      if (block.bindings) scan(JSON.stringify(block.bindings));
      if (Array.isArray(block.body)) {
        block.body.forEach(stmt => scan(JSON.stringify(stmt)));
      }
    } else if (op === 'call') {
      // call演算子: with パラメータをスキャン
      if (block.with) scan(JSON.stringify(block.with));
    } else if (op === 'reduce') {
      // reduce演算子: list と body をスキャン
      scan(block.list || '');
      if (block.value !== undefined) scan(JSON.stringify(block.value));
      if (Array.isArray(block.body)) {
        block.body.forEach(stmt => scan(JSON.stringify(stmt)));
      }
      // accumulator と var は除外
      const accName = (block.accumulator || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      const varName = (block.var || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (accName) set.delete(accName);
      if (varName) set.delete(varName);
    } else if (op === 'while') {
      // while演算子: init, cond, step をスキャン
      if (Array.isArray(block.init)) {
        block.init.forEach(stmt => scan(JSON.stringify(stmt)));
      }
      if (block.cond) scan(JSON.stringify(block.cond));
      if (Array.isArray(block.step)) {
        block.step.forEach(stmt => scan(JSON.stringify(stmt)));
      }
    } else if (op === 'recurse') {
      // recurse演算子: with パラメータをスキャン
      if (block.with) scan(JSON.stringify(block.with));
      if (block.function) {
        if (block.function.base_case) scan(JSON.stringify(block.function.base_case));
        if (Array.isArray(block.function.body)) {
          block.function.body.forEach(stmt => scan(JSON.stringify(stmt)));
        }
      }
    } else {
      // if演算子など、その他の演算子
      scan(JSON.stringify(block.cond || ''));
      scan(block.then || '');
      scan(block.else || '');
      if (block.operands) scan(JSON.stringify(block.operands));
    }
    
    // run_if は全ての op で処理
    if (block.run_if && typeof block.run_if === 'object') scan(JSON.stringify(block.run_if));
  } else if (block.type === 'python') {
    // inputsは配列またはオブジェクトの可能性がある
    const inputs = block.inputs || [];
    if (Array.isArray(inputs)) {
      inputs.forEach(name => {
        if (name && typeof name === 'string') {
          // 入力値内の{...}パターンもスキャン
          scan(name);
        }
      });
    } else if (typeof inputs === 'object') {
      // オブジェクト形式の場合、値をスキャン
      Object.values(inputs).forEach(value => {
        if (value && typeof value === 'string') {
          scan(value);
        }
      });
    }
    if (block.run_if) scan(JSON.stringify(block.run_if));
  } else if (block.type === 'end') {
    scan(block.reason || '');
    if (Array.isArray(block.final)) block.final.forEach(f => scan(f.value || ''));
    if (block.run_if) scan(JSON.stringify(block.run_if));
  }
  return Array.from(set);
}

// -------------------------
// Layout helpers
// -------------------------
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

/** 列ごとに垂直センタリング（ズーム倍率を反映） */
function autolayoutByExec(options = {}) {
  const onlyUnset = !!options.onlyUnset;

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
    const x = xMap.get(ex);

    if (!onlyUnset) {
      // 既存挙動: 列全体を再配置（中央寄せ）
      const n = list.length;
      const colHeight = n * rowH + (n - 1) * marginY;
      const startY = Math.max(32, Math.round((worldH - colHeight) / 2));
      list.forEach((b, idx) => {
        const y = startY + idx * (rowH + marginY);
        b.position = snap({ x, y });
      });
      return;
    }

    // 追加挙動: 位置未設定のノードのみ自動配置（既存座標は維持）
    const hasPos = (bb) => Number.isFinite(bb?.position?.x) && Number.isFinite(bb?.position?.y);
    const existing = list.filter(b => hasPos(b)).sort((a, b) => (a.position.y - b.position.y));
    const missing = list.filter(b => !hasPos(b));
    if (missing.length === 0) return;

    if (existing.length > 0) {
      // 既存の最下段の直下から縦に積む
      let y = existing.reduce((m, bb) => Math.max(m, bb.position.y), 0) + rowH + marginY;
      missing.forEach((b) => {
        b.position = snap({ x, y });
        y += rowH + marginY;
      });
    } else {
      // 既存がない列は、未配置ノードのみで中央寄せ
      const n = missing.length;
      const colHeight = n * rowH + (n - 1) * marginY;
      const startY = Math.max(32, Math.round((worldH - colHeight) / 2));
      missing.forEach((b, idx) => {
        const y = startY + idx * (rowH + marginY);
        b.position = snap({ x, y });
      });
    }
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

  // エンドブロックは常に最後のレベルに移動させる
  const blockById = new Map(state.blocks.map(b => [b.id, b]));
  let maxNonEnd = 0;
  ids.forEach(id => {
    const b = blockById.get(id);
    if (!b) return;
    const l = level.get(id) || 1;
    if (b.type !== 'end') maxNonEnd = Math.max(maxNonEnd, l);
  });
  const endLevel = maxNonEnd + 1;
  ids.forEach(id => {
    const b = blockById.get(id);
    if (b && b.type === 'end') {
      level.set(id, Math.max(level.get(id) || 1, endLevel));
    }
  });

  state.blocks.forEach(b => {
    const newEx = level.get(b.id) || 1;
    b.exec = newEx;
  });
}
