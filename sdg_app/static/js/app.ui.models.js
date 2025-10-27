// =========================
// MABEL Studio Frontend (ui.models: モデル設定パネルの描画/編集)
// - 依存: app.core.js（state, utils, DOM参照）, app.graph.js（drawConnections）
// - 提供: renderModelsPanel, defaultsFields
// =========================

function renderModelsPanel() {
  const container = el('#modelsList');
  container.innerHTML = '';
  state.models.forEach((m, idx) => {
    const details = document.createElement('details');
    details.dataset.index = String(idx);
    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="model-info">
        <span class="model-title">${escapeHtml(m.name || '(unnamed)')}</span>
        <span class="model-id">${escapeHtml(m.api_model || '')}</span>
      </span>
      <button class="model-delete-btn" data-act="del-summary" type="button" title="削除">×</button>
    `;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'model-actions';
    body.innerHTML = `
      <div class="model-actions">
        <button class="ghost" data-act="edit" type="button">Edit</button>
        <button class="ghost" data-act="dup" type="button">Duplicate</button>
        <button class="accent" data-act="del" type="button">Delete</button>
      </div>
    `;
    details.appendChild(body);
    container.appendChild(details);

    // events
    const deleteBtn = summary.querySelector('[data-act="del-summary"]');
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const i = Number(details.dataset.index);
      if (confirm(`モデル "${state.models[i].name}" を削除しますか？`)) {
        state.models.splice(i, 1);
        renderModelsPanel(); renderNodes(); drawConnections();
      }
    });
    
    summary.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-act="del-summary"]')) return;
      ev.preventDefault();
      openModelModal(Number(details.dataset.index));
    });

    body.addEventListener('click', (e) => {
      const t = e.target;
      const i = Number(details.dataset.index);
      if (t.dataset.act === 'edit') {
        openModelModal(i);
      } else if (t.dataset.act === 'del') {
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

// --- Model detail modal ---
function openModelModal(i) {
  const m = state.models[i];
  const dlg = el('#modelModal');
  const body = el('#modelModalBody');
  el('#modelModalTitle').textContent = m.name || 'Model Settings';
  body.innerHTML = buildModelFormHTML(m);

  // 入力反映（ブロック編集と同水準、機能不変）
  body.oninput = (e) => {
    const t = e.target;
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
    renderModelsPanel(); // サマリー（名称など）反映
    renderNodes();
    drawConnections();
  };

  dlg.showModal();
}

function buildModelFormHTML(m) {
  return `
    <div class="form-grid">
      <label>name</label>
      <input data-k="name" value="${escapeAttr(m.name || '')}">
      <label>api_model</label>
      <input data-k="api_model" value="${escapeAttr(m.api_model || '')}">
      <label>api_key <span class="small-note">（例: ${'${ENV.OPENAI_API_KEY}'}）</span></label>
      <input data-k="api_key" value="${escapeAttr(m.api_key || '')}">
      <label>base_url</label>
      <input data-k="base_url" value="${escapeAttr(m.base_url || '')}">

      <details class="full">
        <summary>request_defaults（任意）</summary>
        <div class="form-grid full">
          ${defaultsFields(m.request_defaults || {})}
          <div class="small-note full">未入力は出力YAMLに含めません。</div>
        </div>
      </details>

      <details class="full">
        <summary>advanced（任意）</summary>
        <div class="form-grid full">
          <label>organization</label>
          <input data-kopt="organization" value="${escapeAttr(m.organization || '')}">
          <label>headers（JSON）</label>
          <input data-kopt="headers" placeholder='{"X-Org":"..."}' value='${m.headers ? escapeAttr(JSON.stringify(m.headers)) : ""}'>
        </div>
      </details>
    </div>
  `;
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
