// =========================
// MABEL Studio Frontend (ui.models: モデル設定パネルの描画/編集)
// - 依存: app.core.js（state, utils, DOM参照）, app.graph.js（drawConnections）
// - 提供: renderModelsPanel, defaultsFields
// =========================

function renderModelsPanel() {
  const container = el('#modelsList');
  container.innerHTML = '';

  if (state.models.length === 0) {
    container.innerHTML = '<div class="models-empty">モデルが未登録です。「+ Add Model」で追加してください。</div>';
  }

  state.models.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.dataset.index = String(idx);
    card.innerHTML = `
      <div class="model-card-badge">${idx + 1}</div>
      <div class="model-card-body">
        <span class="model-title">${escapeHtml(m.name || '(unnamed)')}</span>
        <span class="model-id">${escapeHtml(m.api_model || '—')}</span>
      </div>
      <div class="model-card-actions">
        <button class="model-btn model-btn--edit" data-act="edit" type="button" title="編集（クリックで開く）">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11.5 2.5l2 2-7 7-2.5.5.5-2.5 7-7z"/><path d="M10 4l2 2"/></svg>
        </button>
        <button class="model-btn model-btn--dup"  data-act="dup"  type="button" title="複製">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V3h8"/></svg>
        </button>
        <button class="model-btn model-btn--del"  data-act="del"  type="button" title="削除">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V3h4v1M5 4l.5 8h5L11 4"/></svg>
        </button>
      </div>
    `;
    container.appendChild(card);

    card.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const i = Number(card.dataset.index);

      if (act === 'del') {
        if (confirm(`モデル "${state.models[i].name}" を削除しますか？`)) {
          state.models.splice(i, 1);
          renderModelsPanel(); renderNodes(); drawConnections();
        }
      } else if (act === 'dup') {
        const cloned = deepClone(state.models[i], (obj) => {
          if (obj && obj.name) obj.name = obj.name + '_copy';
        });
        state.models.splice(i + 1, 0, cloned);
        renderModelsPanel(); renderNodes(); drawConnections();
      } else if (!e.target.closest('.model-card-actions')) {
        // アクションボタン以外の領域クリック → 編集モーダルを開く
        openModelModal(i);
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
  const dlg = el('#modelModal');
  const body = el('#modelModalBody');

  const renderForm = () => {
    const m = state.models[i];
    // 現在のアクティブタブを記憶
    const activeTab = body.querySelector('.tab-btn.active')?.dataset.tab || 'basic';
    body.innerHTML = buildModelFormHTML(m, activeTab);
    el('#modelModalTitle').textContent = m.name || 'Model Settings';
  };

  renderForm();

  // タブ切り替え（クリックイベント委譲）
  body.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;
    const tabId = tabBtn.dataset.tab;
    els('.tab-btn', body).forEach(b => b.classList.remove('active'));
    els('.tab-pane', body).forEach(p => p.classList.remove('active'));
    tabBtn.classList.add('active');
    el(`#mtab-${tabId}`, body).classList.add('active');
  });

  // 入力値のリアルタイム反映
  body.oninput = (e) => {
    const t = e.target;
    const model = state.models[i];

    if (t.matches('[data-k]')) {
      model[t.dataset.k] = t.value;
    } else if (t.matches('[data-knum]')) {
      const v = t.value;
      if (v === '' || v === undefined) {
        delete model[t.dataset.knum];
      } else {
        model[t.dataset.knum] = toMaybeNumber(v);
      }
    } else if (t.matches('[data-kdef]')) {
      const path = t.dataset.kdef;
      model.request_defaults = model.request_defaults || {};
      if (path.includes('.')) {
        const [a, b] = path.split('.');
        model.request_defaults[a] = model.request_defaults[a] || {};
        if (b === 'backoff') {
          try { model.request_defaults[a][b] = JSON.parse(t.value || '{}'); } catch { /* ignore */ }
        } else {
          model.request_defaults[a][b] = toMaybeNumber(t.value);
        }
      } else {
        model.request_defaults[path] = toMaybeNumber(t.value);
      }
    } else if (t.matches('[data-kopt]')) {
      const k = t.dataset.kopt;
      if (k === 'headers') {
        try { model.headers = JSON.parse(t.value || 'null'); } catch { /* ignore */ }
      } else {
        model[k] = t.value;
      }
    }

    // モーダルタイトルとサイドバーリストを更新（フォームは再描画しない）
    el('#modelModalTitle').textContent = state.models[i].name || 'Model Settings';
    renderModelsPanel();
    renderNodes();
    drawConnections();
  };

  // チェックボックス（boolean）の反映
  body.onchange = (e) => {
    const t = e.target;
    const model = state.models[i];

    if (t.matches('[data-kbool]')) {
      const k = t.dataset.kbool;
      if (t.checked) {
        model[k] = true;
      } else {
        delete model[k];
      }
      renderModelsPanel();
      renderNodes();
      drawConnections();
    }
  };

  dlg.showModal();
}

// --- モデル設定フォーム（タブUI） ---
function buildModelFormHTML(m, activeTab = 'basic') {
  const def = m.request_defaults || {};
  const retry = def.retry || {};

  return `
    <div class="tabs-container model-tabs">
      <div class="tabs-nav">
        <button type="button" class="tab-btn ${activeTab === 'basic' ? 'active' : ''}" data-tab="basic">Basic</button>
        <button type="button" class="tab-btn ${activeTab === 'defaults' ? 'active' : ''}" data-tab="defaults">Defaults</button>
        <button type="button" class="tab-btn ${activeTab === 'reasoning' ? 'active' : ''}" data-tab="reasoning">Reasoning</button>
        <button type="button" class="tab-btn ${activeTab === 'advanced' ? 'active' : ''}" data-tab="advanced">Advanced</button>
      </div>
      <div class="tabs-content">

        <!-- ===== Basic ===== -->
        <div class="tab-pane ${activeTab === 'basic' ? 'active' : ''}" id="mtab-basic">
          <div class="form-grid model-form">
            <label>name</label>
            <input data-k="name" value="${escapeAttr(m.name || '')}" placeholder="my_model" autocomplete="off">

            <label>api_model</label>
            <input data-k="api_model" value="${escapeAttr(m.api_model || '')}" placeholder="gpt-4o" autocomplete="off">

            <label>
              api_key
              <span class="field-hint">（環境変数: <code>\${ENV.変数名}</code>）</span>
            </label>
            <input data-k="api_key" value="${escapeAttr(m.api_key || '')}" placeholder="\${ENV.OPENAI_API_KEY}" autocomplete="off">

            <label>base_url</label>
            <input data-k="base_url" value="${escapeAttr(m.base_url || '')}" placeholder="https://api.openai.com/v1" autocomplete="off">
          </div>
        </div>

        <!-- ===== Defaults ===== -->
        <div class="tab-pane ${activeTab === 'defaults' ? 'active' : ''}" id="mtab-defaults">
          <div class="form-grid model-form">
            <div class="section-title full">生成パラメータ</div>

            <label>temperature</label>
            <input type="number" step="0.01" min="0" max="2"
              data-kdef="temperature" value="${def.temperature ?? ''}" placeholder="（未設定）例: 0.7">

            <label>top_p</label>
            <input type="number" step="0.01" min="0" max="1"
              data-kdef="top_p" value="${def.top_p ?? ''}" placeholder="（未設定）例: 0.95">

            <label>max_tokens</label>
            <input type="number" min="1"
              data-kdef="max_tokens" value="${def.max_tokens ?? ''}" placeholder="（未設定）例: 2048">

            <label>timeout_sec</label>
            <input type="number" min="1"
              data-kdef="timeout_sec" value="${def.timeout_sec ?? ''}" placeholder="（未設定）例: 60">

            <div class="section-title full">リトライ設定</div>

            <label>retry.max_attempts</label>
            <input type="number" min="0"
              data-kdef="retry.max_attempts" value="${retry.max_attempts ?? ''}" placeholder="（未設定）例: 3">

            <label>retry.backoff（JSON）</label>
            <input data-kdef="retry.backoff" class="full"
              placeholder='{"type":"exponential","base":0.5,"max":4.0}'
              value='${retry.backoff ? escapeAttr(JSON.stringify(retry.backoff)) : ""}'>

            <div class="small-note full">未入力の項目は出力 YAML に含まれません。</div>
          </div>
        </div>

        <!-- ===== Reasoning ===== -->
        <div class="tab-pane ${activeTab === 'reasoning' ? 'active' : ''}" id="mtab-reasoning">
          <div class="form-grid model-form">
            <div class="tab-section-note full">
              DeepSeek R1・QwQ 等の推論モデル向け設定です。<br>
              <strong>enable_reasoning: true</strong> が有効化の必須条件です。
            </div>

            <label>enable_reasoning</label>
            <label class="checkbox-label">
              <input type="checkbox" data-kbool="enable_reasoning" ${m.enable_reasoning ? 'checked' : ''}>
              有効にする（推論機能の必須フラグ）
            </label>

            <label>include_reasoning</label>
            <label class="checkbox-label">
              <input type="checkbox" data-kbool="include_reasoning" ${m.include_reasoning ? 'checked' : ''}>
              Reasoning を出力に含める
            </label>

            <label>exclude_reasoning</label>
            <label class="checkbox-label">
              <input type="checkbox" data-kbool="exclude_reasoning" ${m.exclude_reasoning ? 'checked' : ''}>
              Reasoning を内部利用のみ（出力から除外）
            </label>

            <label>reasoning_effort</label>
            <select data-k="reasoning_effort">
              <option value=""       ${!m.reasoning_effort ? 'selected' : ''}>(未設定)</option>
              <option value="minimal" ${m.reasoning_effort === 'minimal' ? 'selected' : ''}>minimal</option>
              <option value="low"     ${m.reasoning_effort === 'low' ? 'selected' : ''}>low</option>
              <option value="medium"  ${m.reasoning_effort === 'medium' ? 'selected' : ''}>medium</option>
              <option value="high"    ${m.reasoning_effort === 'high' ? 'selected' : ''}>high</option>
              <option value="xhigh"   ${m.reasoning_effort === 'xhigh' ? 'selected' : ''}>xhigh</option>
            </select>

            <label>reasoning_max_tokens</label>
            <input type="number" min="1"
              data-knum="reasoning_max_tokens"
              value="${m.reasoning_max_tokens ?? ''}" placeholder="例: 4096">

            <div class="small-note full">未設定の項目は出力 YAML に含まれません。</div>
          </div>
        </div>

        <!-- ===== Advanced ===== -->
        <div class="tab-pane ${activeTab === 'advanced' ? 'active' : ''}" id="mtab-advanced">
          <div class="form-grid model-form">
            <div class="tab-section-note full">
              特殊な用途でのみ使用してください。通常は設定不要です。
            </div>

            <label>organization</label>
            <input data-kopt="organization"
              value="${escapeAttr(m.organization || '')}" placeholder="org-..." autocomplete="off">

            <label>headers（JSON）</label>
            <input data-kopt="headers" class="full"
              placeholder='{"X-Custom-Header": "value"}'
              value='${m.headers ? escapeAttr(JSON.stringify(m.headers)) : ""}'>

            <div class="small-note full">カスタム HTTP ヘッダーが必要な場合のみ設定してください。</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

// 下位互換用（他ファイルから参照がある場合に備えて残す）
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
