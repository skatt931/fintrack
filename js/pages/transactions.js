import { loadData, updateTransactionCells, clearCache } from '../api.js';
import { navigate } from '../router.js';

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  data:           null,
  filterPeriod:   null,   // null = current period
  filterCat:      null,   // null = all categories
  filterWeek:     null,   // null = all weeks, or 1-5 (Math.ceil(day/7))
  filterMerchant: null,   // null = all merchants
  search:         '',
  periodMode:     'billing',
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
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (mode === 'billing') {
    // Find which salary period TODAY falls into — same algorithm as
    // billingPeriodOf() in add.js. This is immune to newly-added transactions
    // that carry a future/wrong period label (e.g. after manual entry).
    const sorted = [...data.salaryPeriods]
      .filter(p => p.start_date && p.period)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (sorted.length) {
      let result = sorted[0].period;
      for (const sp of sorted) {
        if (sp.start_date <= today) result = sp.period;
        else break;
      }
      return result;
    }
    // No salary period data — fall back to most recent period with transactions
    const bps = [...new Set(data.transactions.map(t => t.billing_period).filter(Boolean))].sort();
    if (bps.length) return bps[bps.length - 1];
  }

  // Calendar mode: use today's YYYY-MM
  const thisMonth = today.slice(0, 7);
  const months = [...new Set(data.transactions.map(t => t.month).filter(Boolean))].sort();
  if (months.includes(thisMonth)) return thisMonth;
  if (months.length) return months[months.length - 1];
  return thisMonth;
}

function getCategories(data) {
  const cats = new Set(data.transactions.map(t => t.category).filter(Boolean));
  return [...cats].sort();
}

function getMerchant(t) {
  return t.merchant || t.description || t.note || t.Merchant || '';
}

// Parse a date string in several formats → ms timestamp for sorting.
// Handles: "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS", "YYYY-MM-DDTHH:MM:SS",
//          "DD/MM/YYYY", "DD/MM/YYYY HH:MM:SS".
function parseDateMs(str) {
  if (!str) return 0;
  const s = str.trim();
  // DD/MM/YYYY …
  const euMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (euMatch) return new Date(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`).getTime();
  // ISO-ish: take the first 10 chars (YYYY-MM-DD) and parse
  const iso = s.slice(0, 10);
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function filterTxns(txns, data, filterPeriod, filterCat, search, mode, filterWeek = null, filterMerchant = null) {
  let list = txns;
  if (filterPeriod) {
    const key = mode === 'billing' ? 'billing_period' : 'month';
    list = list.filter(t => t[key] === filterPeriod);
  }
  if (filterCat) list = list.filter(t => t.category === filterCat);
  if (filterWeek !== null) {
    list = list.filter(t => {
      if (!t.date) return false;
      const ms = parseDateMs(t.date);
      return ms ? Math.ceil(new Date(ms).getDate() / 7) === filterWeek : false;
    });
  }
  if (filterMerchant) {
    list = list.filter(t => getMerchant(t).toLowerCase() === filterMerchant.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(t =>
      t.category?.toLowerCase().includes(q) ||
      t.bank?.toLowerCase().includes(q) ||
      Object.values(t).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
    );
  }
  // Sort newest-first using the date-format-aware parser
  return [...list].sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date));
}

// Returns sorted week numbers (1-5) present in the given transaction list
function getWeeksInPeriod(txns) {
  const weeks = new Set(
    txns.map(t => t.date ? Math.ceil(new Date(t.date.slice(0, 10)).getDate() / 7) : null)
        .filter(Boolean)
  );
  return [...weeks].sort((a, b) => a - b);
}

// Normalise any date string to YYYY-MM-DD for use as a group key
function normDateKey(str) {
  if (!str) return '';
  const s = str.trim();
  const eu = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return s.slice(0, 10); // already ISO or ISO-datetime
}

function groupByDate(txns) {
  const groups = {};
  for (const t of txns) {
    const day = normDateKey(t.date);
    if (!groups[day]) groups[day] = [];
    groups[day].push(t);
  }
  // Sort by parsed timestamp descending so mixed date formats sort correctly
  return Object.entries(groups).sort(([a], [b]) => parseDateMs(b) - parseDateMs(a));
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderTransactions(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  const isDrillDown = params.category !== undefined || params.period !== undefined || params.weekNum !== undefined || params.merchant !== undefined;

  if (isDrillDown) {
    // Coming from dashboard — apply the pre-filters
    if (params.category !== undefined) state.filterCat      = params.category;
    if (params.period   !== undefined) state.filterPeriod   = params.period;
    if (params.weekNum  !== undefined) state.filterWeek     = params.weekNum;
    if (params.merchant !== undefined) state.filterMerchant = params.merchant;
  } else {
    // Direct nav (tab bar) — always reset filters so nothing is stale
    state.filterCat      = null;
    state.filterPeriod   = null;
    state.filterWeek     = null;
    state.filterMerchant = null;
    state.search         = '';
  }

  loadData().then(data => {
    state.data = data;
    // Set period to current if not already set by drill-down
    if (!state.filterPeriod) state.filterPeriod = getCurrentPeriod(data, state.periodMode);
    renderPage(el);
  }).catch(err => {
    el.innerHTML = `<div class="txn-page"><div class="error-msg">${err.message}</div></div>`;
  });
}

function renderPage(el) {
  const { data, filterPeriod, filterCat, filterWeek, filterMerchant, search, periodMode } = state;

  // Build period list
  const periods = periodMode === 'billing'
    ? [...new Set(data.salaryPeriods.map(p => p.period).filter(Boolean))].sort().reverse()
    : [...new Set(data.transactions.map(t => t.month).filter(Boolean))].sort().reverse();

  const cats = getCategories(data);

  // Get all period txns (without week/merchant filter) to know which weeks exist
  const periodTxns = filterTxns(data.transactions, data, filterPeriod, null, '', periodMode);
  const weeks      = getWeeksInPeriod(periodTxns);

  const txns   = filterTxns(data.transactions, data, filterPeriod, filterCat, search, periodMode, filterWeek, filterMerchant);
  const groups = groupByDate(txns);

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
        ${filterMerchant ? `<button class="filter-clear filter-clear-merchant" id="clear-merchant">✕ ${filterMerchant}</button>` : ''}
      </div>

      <!-- Week pills (shown when period has multiple weeks of data) -->
      ${weeks.length > 1 ? `
      <div class="week-pills">
        <button class="week-pill ${filterWeek === null ? 'active' : ''}" data-week="all">All weeks</button>
        ${weeks.map(w => `<button class="week-pill ${filterWeek === w ? 'active' : ''}" data-week="${w}">Week ${w}</button>`).join('')}
      </div>` : ''}

      <!-- List -->
      <div class="txn-list">
        ${groups.length ? groups.map(([day, items]) => `
          <div class="txn-date-header">${fmtDateGroup(day)}</div>
          ${items.map(t => {
            const amt      = parseAmount(t.report_amount);
            const isExp    = t.direction === 'expense';
            const review   = t.needs_review === 'TRUE' || t.needs_review === true;
            const merchant = t.merchant || t.description || t.note || t.Merchant || '';
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
                  ${merchant ? '<span class="txn-merchant">' + merchant + '</span>' : ''}
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
  document.getElementById('cat-filter').addEventListener('change', e => {
    state.filterCat = e.target.value || null;
    renderPage(el);
  });
  document.getElementById('clear-filter')?.addEventListener('click', () => {
    state.filterCat = null;
    renderPage(el);
  });
  document.getElementById('clear-merchant')?.addEventListener('click', () => {
    state.filterMerchant = null;
    renderPage(el);
  });

  // Week pills
  el.querySelectorAll('.week-pill').forEach(btn =>
    btn.addEventListener('click', () => {
      const val = btn.dataset.week;
      state.filterWeek = val === 'all' ? null : parseInt(val);
      renderPage(el);
    })
  );

  // Period change resets week + merchant filter
  document.getElementById('period-filter').addEventListener('change', e => {
    state.filterPeriod   = e.target.value;
    state.filterWeek     = null;
    state.filterMerchant = null;
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

  const amt    = parseAmount(txn.report_amount);
  const isExp  = txn.direction === 'expense';
  const review = txn.needs_review === 'TRUE' || txn.needs_review === true;

  // Detect the note/comment/merchant column from the sheet headers
  const NOTE_COLS = ['comment', 'note', 'notes', 'description', 'merchant'];
  const noteField = data.txHeaders.find(h => NOTE_COLS.includes(h.toLowerCase())) || null;
  const noteValue = noteField ? (txn[noteField] || '') : '';

  // Extra display-only fields — exclude the note field (it gets its own editable input)
  const knownFields = new Set([
    'email_id','date','bank','direction','amount','currency',
    'category','month','billing_period','needs_review','report_amount','_row',
    ...(noteField ? [noteField] : []),
  ]);
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

        ${noteField !== null ? `
        <div class="field-group">
          <label class="field-label">Note / Comment</label>
          <textarea class="field-textarea" id="edit-note" rows="2" placeholder="Merchant, description…">${noteValue}</textarea>
        </div>` : ''}

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
    const newNote   = noteField ? (sheet.querySelector('#edit-note')?.value ?? '') : null;
    const btn       = sheet.querySelector('#sheet-save');
    btn.textContent = 'Saving…';
    btn.disabled    = true;

    const updates = { category: newCat, needs_review: newReview };
    if (noteField !== null) updates[noteField] = newNote;

    try {
      await updateTransactionCells(txn._row, data.txHeaders, updates);
      // Mirror updates into the local cache so UI refreshes correctly
      txn.category     = newCat;
      txn.needs_review = newReview;
      if (noteField !== null) txn[noteField] = newNote;
      close();
      renderPage(pageEl);
    } catch (err) {
      btn.textContent = 'Save changes';
      btn.disabled    = false;
      alert(`Save failed: ${err.message}`);
    }
  });
}
