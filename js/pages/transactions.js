import { loadData, updateTransactionCells, clearCache } from '../api.js';
import { navigate } from '../router.js';

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  data:          null,
  filterPeriod:  null,   // null = current period
  filterCat:     null,   // null = all categories
  search:        '',
  periodMode:    'billing',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function fmt(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.abs(n)) + ' Kč';
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str.slice(0, 10));
  if (isNaN(d)) return str.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateGroup(str) {
  if (!str) return '';
  const d = new Date(str.slice(0, 10));
  if (isNaN(d)) return str.slice(0, 10);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getCurrentPeriod(data, mode) {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (mode === 'billing') {
    const periods = data.salaryPeriods.map(p => p.period).filter(Boolean).sort();
    // Find most recent period that has started
    return [...periods].reverse().find(p => p <= cur) || periods[periods.length - 1] || cur;
  }
  return cur;
}

function getCategories(data) {
  const cats = new Set(data.transactions.map(t => t.category).filter(Boolean));
  return [...cats].sort();
}

function filterTxns(txns, data, filterPeriod, filterCat, search, mode) {
  let list = txns;
  if (filterPeriod) {
    const key = mode === 'billing' ? 'billing_period' : 'month';
    list = list.filter(t => t[key] === filterPeriod);
  }
  if (filterCat) list = list.filter(t => t.category === filterCat);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(t =>
      t.category?.toLowerCase().includes(q) ||
      t.bank?.toLowerCase().includes(q) ||
      Object.values(t).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
    );
  }
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function groupByDate(txns) {
  const groups = {};
  for (const t of txns) {
    const day = (t.date || '').slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(t);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderTransactions(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  // Apply params (e.g. from pie chart drill-down)
  if (params.category !== undefined) state.filterCat    = params.category;
  if (params.period   !== undefined) state.filterPeriod = params.period;

  loadData().then(data => {
    state.data = data;
    if (!state.filterPeriod) state.filterPeriod = getCurrentPeriod(data, state.periodMode);
    renderPage(el);
  }).catch(err => {
    el.innerHTML = `<div class="txn-page"><div class="error-msg">${err.message}</div></div>`;
  });
}

function renderPage(el) {
  const { data, filterPeriod, filterCat, search, periodMode } = state;

  // Build period list
  const periods = periodMode === 'billing'
    ? [...new Set(data.salaryPeriods.map(p => p.period).filter(Boolean))].sort().reverse()
    : [...new Set(data.transactions.map(t => t.month).filter(Boolean))].sort().reverse();

  const cats    = getCategories(data);
  const txns    = filterTxns(data.transactions, data, filterPeriod, filterCat, search, periodMode);
  const groups  = groupByDate(txns);

  el.innerHTML = `
    <div class="txn-page">

      <!-- Search -->
      <div class="txn-search-wrap">
        <div class="txn-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="txn-search" type="search" placeholder="Search…" value="${search}" autocomplete="off">
        </div>
      </div>

      <!-- Filters -->
      <div class="txn-filters">
        <select id="period-filter" class="filter-select">
          ${periods.map(p => `<option value="${p}" ${p === filterPeriod ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <select id="cat-filter" class="filter-select">
          <option value="">All categories</option>
          ${cats.map(c => `<option value="${c}" ${c === filterCat ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        ${filterCat ? `<button class="filter-clear" id="clear-filter">✕ ${filterCat}</button>` : ''}
      </div>

      <!-- List -->
      <div class="txn-list">
        ${groups.length ? groups.map(([day, items]) => `
          <div class="txn-date-header">${fmtDateGroup(day)}</div>
          ${items.map(t => {
            const amt    = parseAmount(t.report_amount);
            const isExp  = t.direction === 'expense';
            const review = t.needs_review === 'TRUE' || t.needs_review === true;
            return `
            <div class="txn-item" data-row="${t._row}">
              <div class="txn-dot ${isExp ? 'expense' : 'income'}"></div>
              <div class="txn-body">
                <div class="txn-main">
                  <span class="txn-category">${t.category || '—'}</span>
                  <span class="txn-amount ${isExp ? 'expense' : 'income'}">${isExp ? '-' : '+'}${fmt(amt)}</span>
                </div>
                <div class="txn-sub">
                  <span>${t.bank || '—'}</span>
                  ${review ? '<span class="txn-badge review">Review</span>' : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        `).join('') : '<div class="txn-empty">No transactions found</div>'}
      </div>

    </div>
  `;

  // Events
  document.getElementById('txn-search').addEventListener('input', e => {
    state.search = e.target.value;
    renderPage(el);
  });
  document.getElementById('period-filter').addEventListener('change', e => {
    state.filterPeriod = e.target.value;
    renderPage(el);
  });
  document.getElementById('cat-filter').addEventListener('change', e => {
    state.filterCat = e.target.value || null;
    renderPage(el);
  });
  document.getElementById('clear-filter')?.addEventListener('click', () => {
    state.filterCat = null;
    renderPage(el);
  });

  // Row tap → edit sheet
  el.querySelectorAll('.txn-item').forEach(item => {
    item.addEventListener('click', () => {
      const row = parseInt(item.dataset.row);
      const txn = data.transactions.find(t => t._row === row);
      if (txn) openEditSheet(txn, data, el);
    });
  });
}

// ── Edit bottom sheet ─────────────────────────────────────────────────────────

function openEditSheet(txn, data, pageEl) {
  const allCats = [
    ...new Set([
      ...data.budgets.map(b => b.Category).filter(Boolean),
      ...data.budgets.map(b => b.all_categories).filter(Boolean),
    ])
  ].sort();

  const amt     = parseAmount(txn.report_amount);
  const isExp   = txn.direction === 'expense';
  const review  = txn.needs_review === 'TRUE' || txn.needs_review === true;

  // Extra fields (merchant, comment, description, note — whatever exists)
  const knownFields = new Set(['email_id','date','bank','direction','amount','currency','category','month','billing_period','needs_review','report_amount','_row']);
  const extraFields = Object.entries(txn).filter(([k]) => !knownFields.has(k) && !k.startsWith('_') && txn[k]);

  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-panel">
      <div class="sheet-handle"></div>

      <div class="sheet-header">
        <div>
          <div class="sheet-title">${txn.category || 'Transaction'}</div>
          <div class="sheet-subtitle">${fmtDate(txn.date)} · ${txn.bank || '—'}</div>
        </div>
        <div class="sheet-amount ${isExp ? 'expense' : 'income'}">${isExp ? '-' : '+'}${fmt(amt)}</div>
      </div>

      ${extraFields.length ? `
        <div class="sheet-extras">
          ${extraFields.map(([k, v]) => `
            <div class="sheet-extra-row">
              <span class="sheet-extra-key">${k.replace(/_/g,' ')}</span>
              <span class="sheet-extra-val">${v}</span>
            </div>`).join('')}
        </div>` : ''}

      <div class="sheet-fields">
        <div class="field-group">
          <label class="field-label">Category</label>
          <select class="field-select" id="edit-category">
            ${allCats.map(c => `<option value="${c}" ${c === txn.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>

        <div class="field-group">
          <label class="field-label">Needs review</label>
          <label class="toggle-wrap">
            <input type="checkbox" id="edit-review" ${review ? 'checked' : ''}>
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label" id="review-label">${review ? 'Yes' : 'No'}</span>
          </label>
        </div>
      </div>

      <div class="sheet-actions">
        <button class="btn-secondary" id="sheet-cancel">Cancel</button>
        <button class="btn-save" id="sheet-save">Save changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.querySelector('.sheet-panel').classList.add('open'));

  const close = () => {
    sheet.querySelector('.sheet-panel').classList.remove('open');
    setTimeout(() => sheet.remove(), 280);
  };

  sheet.querySelector('.sheet-backdrop').addEventListener('click', close);
  sheet.querySelector('#sheet-cancel').addEventListener('click', close);

  sheet.querySelector('#edit-review').addEventListener('change', e => {
    sheet.querySelector('#review-label').textContent = e.target.checked ? 'Yes' : 'No';
  });

  sheet.querySelector('#sheet-save').addEventListener('click', async () => {
    const newCat    = sheet.querySelector('#edit-category').value;
    const newReview = sheet.querySelector('#edit-review').checked ? 'TRUE' : 'FALSE';
    const btn       = sheet.querySelector('#sheet-save');
    btn.textContent = 'Saving…';
    btn.disabled    = true;

    try {
      await updateTransactionCells(txn._row, data.txHeaders, {
        category:     newCat,
        needs_review: newReview,
      });
      // Update local cache too
      txn.category     = newCat;
      txn.needs_review = newReview;
      close();
      renderPage(pageEl);
    } catch (err) {
      btn.textContent = 'Save changes';
      btn.disabled    = false;
      alert(`Save failed: ${err.message}`);
    }
  });
}
