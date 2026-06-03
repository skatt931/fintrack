import { loadData, updatePlannedExpense, appendPlannedExpense } from '../api.js';
import { navigate }         from '../router.js';
import { getCategoryEmoji } from '../categoryIcons.js';

function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function fmt(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.abs(n)) + ' Kč';
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

// Most recent salary period start_date on or before today
function billingPeriodStart(salaryPeriods) {
  const t = todayStr();
  const sorted = [...salaryPeriods]
    .filter(p => p.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  let result = null;
  for (const sp of sorted) {
    if (sp.start_date <= t) result = sp.start_date;
    else break;
  }
  return result || t;
}

// Next salary period start_date after today, or null
function nextPayday(salaryPeriods) {
  const t = todayStr();
  return [...salaryPeriods]
    .filter(p => p.start_date && p.start_date > t)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]?.start_date || null;
}

// Was this recurring item paid in the current billing period?
function isPaidThisPeriod(item, periodStart) {
  const lpd = item.last_paid_date || '';
  if (!lpd) return false;
  return lpd >= periodStart && lpd <= todayStr();
}

// Split items into display groups
function classify(planned, salaryPeriods) {
  const periodStart = billingPeriodStart(salaryPeriods);
  const cutoff      = nextPayday(salaryPeriods) || '9999-99-99';

  const upcoming  = [];
  const recurring = [];
  const later     = [];
  const paid      = [];
  const cancelled = [];

  // Skip sheet rows that have no name — these are Google Sheets formatting artefacts
  // (e.g. checkbox columns default 'FALSE' on many rows, making them pass the non-empty filter)
  for (const item of planned.filter(p => (p.name || '').trim())) {
    const isRec  = item.recurring === 'TRUE' || item.recurring === true;
    const status = item.status || 'planned';

    if (status === 'cancelled') { cancelled.push(item); continue; }

    if (isRec) {
      const paidThis = isPaidThisPeriod(item, periodStart);
      recurring.push({ ...item, _paidThisPeriod: paidThis });
      // Also counts as upcoming if not paid and due before cutoff
      if (!paidThis && item.due_date && item.due_date <= cutoff) upcoming.push(item);
      continue;
    }

    if (status === 'paid') { paid.push(item); continue; }
    if (item.due_date && item.due_date <= cutoff) upcoming.push(item);
    else later.push(item);
  }

  return { upcoming, recurring, later, paid, cancelled };
}

// Add canonical lowercase aliases to each row so item.name / item.amount / etc.
// work regardless of the actual case of the sheet headers
// ("Name" → also creates item.name; "Due Date" → also creates item.due_date).
function withLowercaseAliases(rows) {
  const wanted = ['name','category','amount','due_date','recurring','recurring_period','status','last_paid_date','notes'];
  return rows.map(row => {
    const out = { ...row };
    for (const want of wanted) {
      if (out[want] != null && out[want] !== '') continue; // already set
      const wantNorm = want.replace(/[\s_-]/g, '');
      for (const [k, v] of Object.entries(row)) {
        if (k.startsWith('_')) continue;
        const kNorm = String(k).toLowerCase().replace(/[\s_-]/g, '');
        if (kNorm === wantNorm) { out[want] = v; break; }
      }
    }
    return out;
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderPlanned(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;
  loadData()
    .then(data => {
      // Normalise planned row keys so the page works regardless of sheet header case
      const normalised = { ...data, planned: withLowercaseAliases(data.planned || []) };
      renderPage(el, normalised);
    })
    .catch(err => {
      el.innerHTML = `<div class="planned-page"><div class="error-msg">${err.message}</div></div>`;
    });
}

// ── List render ───────────────────────────────────────────────────────────────

function renderPage(el, data) {
  const { planned = [], plannedHeaders = [], salaryPeriods = [] } = data;

  // If the sheet tab exists but has no header row the headers array is empty.
  // This happens when the app was loaded before the sheet was created in Google Sheets.
  // The user must refresh data (⋮ → Refresh Data) to pick up the headers.
  if (!plannedHeaders.length) {
    el.innerHTML = `
      <div class="planned-page">
        <button class="bp-back" id="planned-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Overview
        </button>
        <div class="planned-empty" style="padding-top:48px">
          <p style="font-size:1.5rem;margin-bottom:12px">⚠️</p>
          <p><strong>Sheet headers not loaded.</strong></p>
          <p style="margin-top:8px;font-size:0.8rem">The Planned Expenses sheet was created after this session started.<br>
          Tap <strong>⋮ → Refresh Data</strong> to reload, then try again.</p>
        </div>
      </div>`;
    el.querySelector('#planned-back').addEventListener('click', () => navigate('dashboard'));
    return;
  }

  const cats = [...new Set([
    ...data.budgets.map(b => b.Category).filter(Boolean),
    ...data.budgets.map(b => b.all_categories).filter(Boolean),
  ])].sort();

  const { upcoming, recurring, later, paid, cancelled } = classify(planned, salaryPeriods);

  function itemRow(item, showPaidBadge = false) {
    const emoji    = getCategoryEmoji(item.category || '');
    const isRec    = item.recurring === 'TRUE' || item.recurring === true;
    const paidBadge = showPaidBadge && item._paidThisPeriod
      ? '<span class="planned-paid-badge">✓ Paid</span>' : '';
    return `
    <div class="planned-row" data-row="${item._row}">
      <span class="planned-emoji">${emoji}</span>
      <div class="planned-body">
        <div class="planned-main">
          <span class="planned-name">${item.name || '—'}</span>
          <span class="planned-amount">−${fmt(parseAmount(item.amount))}</span>
        </div>
        <div class="planned-sub">
          <span>${fmtDate(item.due_date)}</span>
          ${isRec ? `<span class="planned-badge">${item.recurring_period || 'recurring'}</span>` : ''}
          ${paidBadge}
        </div>
      </div>
      <button class="planned-edit-btn" data-row="${item._row}" aria-label="Edit">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>`;
  }

  function section(title, items, showMarkPaid = false, showPaidBadge = false) {
    if (!items.length) return '';
    return `
    <div class="planned-section">
      <div class="section-title">${title}</div>
      <div class="budget-list">
        ${items.map(item => `
        <div class="planned-item-wrap">
          ${itemRow(item, showPaidBadge)}
          ${showMarkPaid && !item._paidThisPeriod ? `
          <button class="planned-pay-btn" data-row="${item._row}" data-recurring="${item.recurring}">
            Mark as paid
          </button>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div class="planned-page">
      <button class="bp-back" id="planned-back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Overview
      </button>

      ${!planned.length ? `
      <div class="planned-empty">
        <p>No planned expenses yet.</p>
        <p style="margin-top:8px;font-size:0.8rem">Add upcoming bills or purchases to track your projected balance.</p>
      </div>` : ''}

      ${section('Upcoming', upcoming, true)}
      ${section('Recurring', recurring, false, true)}
      ${section('Later', later)}
      ${paid.length ? section('Paid', paid) : ''}
      ${cancelled.length ? `
      <details class="planned-cancelled">
        <summary class="section-title" style="cursor:pointer;list-style:none">Cancelled (${cancelled.length})</summary>
        <div class="budget-list">${cancelled.map(i => itemRow(i)).join('')}</div>
      </details>` : ''}

      <button class="planned-add-btn" id="planned-add">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        Add planned expense
      </button>
    </div>
  `;

  // ── Events ──────────────────────────────────────────────────────────────────

  el.querySelector('#planned-back').addEventListener('click', () => navigate('dashboard'));
  el.querySelector('#planned-add').addEventListener('click', () => openPlannedSheet(null, data, cats, el));

  el.querySelectorAll('.planned-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const row  = parseInt(btn.dataset.row);
      const item = planned.find(p => p._row === row);
      if (item) openPlannedSheet(item, data, cats, el);
    });
  });

  el.querySelectorAll('.planned-row').forEach(row => {
    row.addEventListener('click', () => {
      const r    = parseInt(row.dataset.row);
      const item = planned.find(p => p._row === r);
      if (item) openPlannedSheet(item, data, cats, el);
    });
  });

  el.querySelectorAll('.planned-pay-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const row   = parseInt(btn.dataset.row);
      const isRec = btn.dataset.recurring === 'TRUE' || btn.dataset.recurring === 'true';
      const item  = planned.find(p => p._row === row);
      if (!item) return;

      btn.textContent = 'Saving…';
      btn.disabled    = true;

      try {
        if (isRec) {
          await updatePlannedExpense(row, plannedHeaders, { last_paid_date: todayStr() });
        } else {
          await updatePlannedExpense(row, plannedHeaders, { status: 'paid' });
        }
        renderPlanned(el);
      } catch (err) {
        btn.textContent = 'Mark as paid';
        btn.disabled    = false;
        alert(`Failed: ${err.message}`);
      }
    });
  });
}

// ── Add / Edit bottom sheet ───────────────────────────────────────────────────

function openPlannedSheet(item, data, cats, pageEl) {
  const isEdit  = !!item;
  const isRec   = item?.recurring === 'TRUE' || item?.recurring === true;
  const v       = k => (item && item[k] != null) ? String(item[k]) : '';

  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-panel" id="ps-panel">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">${isEdit ? 'Edit' : 'Add'} Planned Expense</div>
      </div>
      <div class="sheet-fields">
        <div class="field-group">
          <label class="field-label">Name *</label>
          <input class="field-input" id="ps-name" type="text" placeholder="e.g. Netflix, Rent"
                 value="${v('name').replace(/"/g, '&quot;')}">
        </div>
        <div class="field-group">
          <label class="field-label">Amount (Kč) *</label>
          <input class="field-input" id="ps-amount" type="number" min="0" step="1"
                 placeholder="0" value="${v('amount')}">
        </div>
        <div class="field-group">
          <label class="field-label">Category</label>
          <select class="field-select" id="ps-category">
            <option value="">— None —</option>
            ${cats.map(c => `<option value="${c}" ${c === v('category') ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Due date *</label>
          <input class="field-input" id="ps-due" type="date" value="${v('due_date')}">
        </div>
        <div class="field-group">
          <label class="field-label">Recurring</label>
          <label class="toggle-wrap">
            <input type="checkbox" id="ps-recurring" ${isRec ? 'checked' : ''}>
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label" id="ps-rec-label">${isRec ? 'Yes' : 'No'}</span>
          </label>
        </div>
        <div class="field-group" id="ps-period-group" style="display:${isRec ? 'flex' : 'none'};flex-direction:column;gap:6px">
          <label class="field-label">Recurring period</label>
          <select class="field-select" id="ps-period">
            <option value="monthly"   ${v('recurring_period') === 'monthly'   ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${v('recurring_period') === 'quarterly' ? 'selected' : ''}>Quarterly</option>
            <option value="yearly"    ${v('recurring_period') === 'yearly'    ? 'selected' : ''}>Yearly</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Notes <span class="field-optional">(optional)</span></label>
          <input class="field-input" id="ps-notes" type="text" placeholder="Any notes…"
                 value="${v('notes').replace(/"/g, '&quot;')}">
        </div>
        ${isEdit ? `
        <div class="field-group">
          <label class="field-label">Status</label>
          <select class="field-select" id="ps-status">
            <option value="planned"   ${v('status') === 'planned'   ? 'selected' : ''}>Planned</option>
            <option value="paid"      ${v('status') === 'paid'      ? 'selected' : ''}>Paid</option>
            <option value="cancelled" ${v('status') === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>` : ''}
      </div>
      <div class="sheet-actions">
        <button class="btn-secondary" id="ps-cancel">Cancel</button>
        <button class="btn-save" id="ps-save">${isEdit ? 'Save changes' : 'Add'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  const panel = sheet.querySelector('#ps-panel');
  requestAnimationFrame(() => panel.classList.add('open'));

  // Keep the sheet above the virtual keyboard.
  // The sheet-panel has max-height:90vh which is 90% of the FULL screen height.
  // When the keyboard appears and shrinks the overlay to vv.height, the panel can
  // still try to be 720px (90% of 800px screen) inside a 500px overlay — it
  // overflows ABOVE the overlay, pushing the top fields off screen.
  // Fix: also cap panel.maxHeight to vv.height so it fits within the visible area.
  const vv = window.visualViewport;
  const onVVChange = () => {
    if (!vv) return;
    sheet.style.top       = `${vv.offsetTop}px`;
    sheet.style.height    = `${vv.height}px`;
    panel.style.maxHeight = `${vv.height}px`;
  };
  if (vv) { vv.addEventListener('resize', onVVChange); vv.addEventListener('scroll', onVVChange); }

  const close = () => {
    if (vv) { vv.removeEventListener('resize', onVVChange); vv.removeEventListener('scroll', onVVChange); }
    sheet.style.top       = '';
    sheet.style.height    = '';
    panel.style.maxHeight = '';
    panel.classList.remove('open');
    setTimeout(() => sheet.remove(), 280);
  };

  sheet.querySelector('.sheet-backdrop').addEventListener('click', close);
  sheet.querySelector('#ps-cancel').addEventListener('click', close);

  const recEl       = sheet.querySelector('#ps-recurring');
  const periodGroup = sheet.querySelector('#ps-period-group');
  const recLabel    = sheet.querySelector('#ps-rec-label');
  recEl.addEventListener('change', () => {
    periodGroup.style.display = recEl.checked ? 'flex' : 'none';
    recLabel.textContent      = recEl.checked ? 'Yes' : 'No';
  });

  sheet.querySelector('#ps-save').addEventListener('click', async () => {
    const name   = sheet.querySelector('#ps-name').value.trim();
    const amount = sheet.querySelector('#ps-amount').value.trim();
    const due    = sheet.querySelector('#ps-due').value;

    if (!name)   { alert('Name is required.');     return; }
    if (!amount) { alert('Amount is required.');   return; }
    if (!due)    { alert('Due date is required.'); return; }

    const saveBtn = sheet.querySelector('#ps-save');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    const { plannedHeaders } = data;
    const fields = {
      name,
      category:         sheet.querySelector('#ps-category').value,
      amount:           String(Math.round(parseFloat(amount) || 0)),
      due_date:         due,
      recurring:        recEl.checked ? 'TRUE' : 'FALSE',
      recurring_period: recEl.checked ? sheet.querySelector('#ps-period').value : '',
      status:           isEdit ? sheet.querySelector('#ps-status')?.value || 'planned' : 'planned',
      last_paid_date:   v('last_paid_date'),
      notes:            sheet.querySelector('#ps-notes').value.trim(),
    };

    try {
      if (isEdit) {
        await updatePlannedExpense(item._row, plannedHeaders, fields);
      } else {
        await appendPlannedExpense(plannedHeaders, fields);
      }
      close();
      renderPlanned(pageEl);
    } catch (err) {
      saveBtn.textContent = isEdit ? 'Save changes' : 'Add';
      saveBtn.disabled    = false;
      alert(`Failed: ${err.message}`);
    }
  });

  setTimeout(() => sheet.querySelector('#ps-name').focus(), 300);
}
