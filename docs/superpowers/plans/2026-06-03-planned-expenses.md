# Planned Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create planned / committed future expenses that reduce a "Projected Balance" shown on the Dashboard, backed by a pure-data "Planned Expenses" Google Sheets tab.

**Architecture:** New `Planned Expenses` sheet tab acts as a database (no formulas). `api.js` gains two new functions (`updatePlannedExpense`, `appendPlannedExpense`) plus loads the new sheet. A new `js/pages/planned.js` page handles list + add/edit. The Dashboard gets a helper (`computeNextPayday`) and a new configurable section that shows upcoming items and the projected balance. All logic for "is this item upcoming?", "is recurring paid this period?" lives in the app.

**Tech Stack:** Vanilla ES Modules, Google Sheets API v4 (batchUpdate + append), existing `.sheet-*` CSS classes, existing `bp-back` / `budget-list` patterns.

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `js/config.js` | Add `planned: 'Planned Expenses'` to `SHEETS` |
| Modify | `js/api.js` | Load planned sheet in `loadData`; add `updatePlannedExpense`, `appendPlannedExpense` |
| Modify | `js/settings.js` | Add `{ id: 'planned', label: 'Planned Expenses' }` to `SECTION_DEFS` |
| Create | `js/pages/planned.js` | Full management page (list + add/edit bottom sheet + mark as paid) |
| Modify | `js/pages/dashboard.js` | `computeNextPayday` + `getUpcomingPlanned` helpers; planned section HTML + events |
| Modify | `js/router.js` | Add `planned: 'Planned'` to `PAGE_TITLES` |
| Modify | `js/app.js` | Import + register `renderPlanned`; add "Planned Expenses" item to menu sheet |
| Modify | `css/app.css` | Dashboard planned section + management page styles |
| Modify | `FEATURES.md` | Document Planned Expenses |
| Modify | `index.html` + `sw.js` | Bump to v20 |

---

## Task 1: Config + API

**Files:**
- Modify: `js/config.js`
- Modify: `js/api.js`

- [ ] **Step 1: Add `planned` sheet name to config**

In `js/config.js`, change `SHEETS` to:
```js
export const SHEETS = {
  transactions:  'Transactions',
  budgets:       'Budgets',
  salaryPeriods: 'Salary Periods',
  planned:       'Planned Expenses',
};
```

- [ ] **Step 2: Add planned sheet to `loadData`**

In `js/api.js`, inside `loadData`, change the `Promise.all` call and its return:
```js
  const data = await withAuth(async token => {
    const [txResult, budgetsResult, spResult, plannedResult] = await Promise.all([
      fetchRange(SHEETS.transactions,  token),
      fetchRange(SHEETS.budgets,       token),
      fetchRange(SHEETS.salaryPeriods, token),
      fetchRange(SHEETS.planned,       token),
    ]);
    return {
      transactions:   txResult.rows,
      txHeaders:      txResult.headers,
      budgets:        budgetsResult.rows,
      budgetHeaders:  budgetsResult.headers,
      salaryPeriods:  spResult.rows,
      planned:        plannedResult.rows,
      plannedHeaders: plannedResult.headers,
      loadedAt:       Date.now(),
    };
  });
```

Note: `fetchRange` already returns `{ headers: [], rows: [] }` when the sheet is empty or missing, so this is safe even before the user creates the sheet tab.

- [ ] **Step 3: Add `updatePlannedExpense` export**

Append after `appendBudgetRow` at the bottom of `js/api.js`:
```js
// Update specific fields of a planned expense row (any column by header name).
export async function updatePlannedExpense(row, plannedHeaders, fields) {
  const data = Object.entries(fields)
    .map(([field, value]) => {
      const idx = plannedHeaders.indexOf(field);
      if (idx === -1) return null;
      return {
        range:  `${SHEETS.planned}!${colLetter(idx)}${row}`,
        values: [[value]],
      };
    })
    .filter(Boolean);

  if (!data.length) return;

  await withAuth(async token => {
    const url  = `${BASE}/values:batchUpdate`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Update failed: ${resp.status}`);
    }
  });

  clearCache();
}

// Append a new row to the Planned Expenses sheet.
// fields must include at minimum: name, amount, due_date, status.
export async function appendPlannedExpense(plannedHeaders, fields) {
  const rowValues = plannedHeaders.map(h => fields[h] ?? '');

  await withAuth(async token => {
    const url  = `${BASE}/values/${encodeURIComponent(SHEETS.planned)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values: [rowValues] }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Append failed: ${resp.status}`);
    }
  });

  clearCache();
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/ihor.kurnytskyi/My_projects/Claude/finance-pwa
git add js/config.js js/api.js
git commit -m "feat: add Planned Expenses sheet to config and api"
```

---

## Task 2: Settings + Router + App registration

**Files:**
- Modify: `js/settings.js`
- Modify: `js/router.js`
- Modify: `js/app.js`

- [ ] **Step 1: Add `planned` to `SECTION_DEFS` in `js/settings.js`**

Append to the `SECTION_DEFS` array (after `owes`):
```js
  { id: 'owes',       label: 'Owes You' },
  { id: 'planned',    label: 'Planned Expenses' },
```

- [ ] **Step 2: Add `planned` to `PAGE_TITLES` in `js/router.js`**

```js
const PAGE_TITLES = {
  dashboard:    'Overview',
  transactions: 'Records',
  add:          'Add Expense',
  breakdown:    'Spending',
  merchants:    'Merchants',
  daily:        'Daily View',
  settings:     'Settings',
  planned:      'Planned',
};
```

- [ ] **Step 3: Register `renderPlanned` in `js/app.js`**

Add to imports (after `renderSettings`):
```js
import { renderPlanned }                    from './pages/planned.js';
```

Add to `startApp()` (after `register('settings', renderSettings)`):
```js
  register('planned', renderPlanned);
```

- [ ] **Step 4: Add "Planned Expenses" to the menu action sheet in `js/app.js`**

In `openMenuSheet`, find the `#menu-settings` button HTML and add a new button before it:
```js
      <button class="menu-action" id="menu-planned">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="8" y1="14" x2="8" y2="14"/>
          <line x1="12" y1="14" x2="12" y2="14"/>
        </svg>
        Planned Expenses
      </button>
```

Add the click handler after the existing `#menu-settings` handler:
```js
  sheet.querySelector('#menu-planned').addEventListener('click', () => {
    close();
    setTimeout(() => navigate('planned'), 300);
  });
```

- [ ] **Step 5: Create stub `js/pages/planned.js` so the import resolves**

```js
export function renderPlanned(el, params = {}) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>';
}
```

- [ ] **Step 6: Commit**

```bash
git add js/settings.js js/router.js js/app.js js/pages/planned.js
git commit -m "feat: register planned expenses page and menu entry"
```

---

## Task 3: Full `planned.js` page

**Files:**
- Modify: `js/pages/planned.js` (replace stub)

The page has three concerns: listing items by section, the add/edit bottom sheet, and mark-as-paid.

Key constants used throughout:
- `parseAmount(val)` — same pattern as other pages
- `fmt(n)` — CZK formatting
- `fmtDate(str)` — human-readable date

- [ ] **Step 1: Write the full `js/pages/planned.js`**

```js
import { loadData, updatePlannedExpense, appendPlannedExpense, clearCache } from '../api.js';
import { navigate }       from '../router.js';
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

// YYYY-MM-DD today string
function today() { return new Date().toISOString().slice(0, 10); }

// Current billing period start date (the most recent start_date <= today)
function billingPeriodStart(salaryPeriods) {
  const t = today();
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
  const t = today();
  const sorted = [...salaryPeriods]
    .filter(p => p.start_date && p.start_date > t)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return sorted[0]?.start_date || null;
}

// Is a recurring item paid in the current billing period?
function isPaidThisPeriod(item, periodStart) {
  const lpd = item.last_paid_date || '';
  if (!lpd) return false;
  return lpd >= periodStart && lpd <= today();
}

// Classify items into sections
function classify(planned, salaryPeriods) {
  const periodStart = billingPeriodStart(salaryPeriods);
  const cutoff      = nextPayday(salaryPeriods) || '9999-99-99';
  const t           = today();

  const upcoming   = [];
  const recurring  = [];
  const later      = [];
  const paid       = [];
  const cancelled  = [];

  for (const item of planned) {
    const isRecurring = item.recurring === 'TRUE' || item.recurring === true;
    const status      = item.status || 'planned';

    if (status === 'cancelled') { cancelled.push(item); continue; }

    if (isRecurring) {
      recurring.push({ ...item, _paidThisPeriod: isPaidThisPeriod(item, periodStart) });
      // Also add to upcoming if not paid this period and due before cutoff
      const due = item.due_date || '';
      if (!isPaidThisPeriod(item, periodStart) && due <= cutoff) {
        upcoming.push(item);
      }
      continue;
    }

    // One-time
    if (status === 'paid') { paid.push(item); continue; }
    const due = item.due_date || '';
    if (due && due <= cutoff) { upcoming.push(item); }
    else { later.push(item); }
  }

  return { upcoming, recurring, later, paid, cancelled };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderPlanned(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  loadData().then(data => {
    renderPage(el, data);
  }).catch(err => {
    el.innerHTML = `<div class="planned-page"><div class="error-msg">${err.message}</div></div>`;
  });
}

// ── List page ─────────────────────────────────────────────────────────────────

function renderPage(el, data) {
  const { planned = [], plannedHeaders = [], salaryPeriods = [] } = data;
  const { upcoming, recurring, later, paid, cancelled } = classify(planned, salaryPeriods);

  function itemRow(item, showPaid = false) {
    const emoji   = getCategoryEmoji(item.category || '');
    const isRec   = item.recurring === 'TRUE' || item.recurring === true;
    const paidBadge = showPaid && item._paidThisPeriod
      ? '<span class="planned-paid-badge">✓ Paid</span>' : '';
    return `
    <div class="planned-row" data-row="${item._row}">
      <span class="planned-emoji">${emoji}</span>
      <div class="planned-body">
        <div class="planned-main">
          <span class="planned-name">${item.name || '—'}</span>
          <span class="planned-amount">${fmt(parseAmount(item.amount))}</span>
        </div>
        <div class="planned-sub">
          <span>${fmtDate(item.due_date)}</span>
          ${isRec ? `<span class="planned-badge">${item.recurring_period || 'recurring'}</span>` : ''}
          ${paidBadge}
        </div>
      </div>
      <button class="planned-edit-btn" data-row="${item._row}" aria-label="Edit">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
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
          ${showMarkPaid && !(item._paidThisPeriod) ? `
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
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Overview
      </button>

      ${!planned.length ? `
      <div class="planned-empty">
        <p>No planned expenses yet.</p>
        <p>Add upcoming bills or purchases to track your projected balance.</p>
      </div>` : ''}

      ${section('Upcoming', upcoming, true)}
      ${section('Recurring', recurring, false, true)}
      ${section('Later', later)}
      ${paid.length ? section('Paid', paid) : ''}
      ${cancelled.length ? `
      <details class="planned-cancelled">
        <summary class="section-title">Cancelled (${cancelled.length})</summary>
        <div class="budget-list">${cancelled.map(i => itemRow(i)).join('')}</div>
      </details>` : ''}

      <button class="planned-add-btn" id="planned-add">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        Add planned expense
      </button>
    </div>
  `;

  // Back
  el.querySelector('#planned-back').addEventListener('click', () => navigate('dashboard'));

  // Add
  el.querySelector('#planned-add').addEventListener('click', () => {
    openPlannedSheet(null, data, el);
  });

  // Edit buttons
  el.querySelectorAll('.planned-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const row  = parseInt(btn.dataset.row);
      const item = planned.find(p => p._row === row);
      if (item) openPlannedSheet(item, data, el);
    });
  });

  // Row tap → edit
  el.querySelectorAll('.planned-row').forEach(row => {
    row.addEventListener('click', () => {
      const r    = parseInt(row.dataset.row);
      const item = planned.find(p => p._row === r);
      if (item) openPlannedSheet(item, data, el);
    });
  });

  // Mark as paid
  el.querySelectorAll('.planned-pay-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const row       = parseInt(btn.dataset.row);
      const isRec     = btn.dataset.recurring === 'TRUE' || btn.dataset.recurring === 'true';
      const item      = planned.find(p => p._row === row);
      if (!item) return;

      btn.textContent = 'Saving…';
      btn.disabled    = true;

      try {
        if (isRec) {
          await updatePlannedExpense(row, plannedHeaders, { last_paid_date: today() });
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

function openPlannedSheet(item, data, pageEl) {
  const isEdit  = !!item;
  const cats    = [...new Set([
    ...data.budgets.map(b => b.Category).filter(Boolean),
    ...data.budgets.map(b => b.all_categories).filter(Boolean),
  ])].sort();

  const v = k => (item && item[k]) ? item[k] : '';
  const isRec = item?.recurring === 'TRUE' || item?.recurring === true;

  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-panel" id="planned-sheet-panel">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title">${isEdit ? 'Edit' : 'Add'} Planned Expense</div>
      </div>
      <div class="sheet-fields">
        <div class="field-group">
          <label class="field-label">Name *</label>
          <input class="field-input" id="ps-name" type="text" placeholder="e.g. Netflix, Rent" value="${v('name').replace(/"/g,'&quot;')}">
        </div>
        <div class="field-group">
          <label class="field-label">Amount (Kč) *</label>
          <input class="field-input" id="ps-amount" type="number" min="0" step="1" placeholder="0" value="${v('amount')}">
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
          <input class="field-input" id="ps-notes" type="text" placeholder="Any notes…" value="${v('notes').replace(/"/g,'&quot;')}">
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

  const panel = sheet.querySelector('#planned-sheet-panel');
  requestAnimationFrame(() => panel.classList.add('open'));

  const vv = window.visualViewport;
  const onVVChange = () => {
    if (!vv) return;
    sheet.style.top    = `${vv.offsetTop}px`;
    sheet.style.height = `${vv.height}px`;
  };
  if (vv) { vv.addEventListener('resize', onVVChange); vv.addEventListener('scroll', onVVChange); }

  const close = () => {
    if (vv) { vv.removeEventListener('resize', onVVChange); vv.removeEventListener('scroll', onVVChange); }
    sheet.style.top = ''; sheet.style.height = '';
    panel.classList.remove('open');
    setTimeout(() => sheet.remove(), 280);
  };

  sheet.querySelector('.sheet-backdrop').addEventListener('click', close);
  sheet.querySelector('#ps-cancel').addEventListener('click', close);

  // Recurring toggle
  const recEl      = sheet.querySelector('#ps-recurring');
  const periodGroup = sheet.querySelector('#ps-period-group');
  const recLabel   = sheet.querySelector('#ps-rec-label');
  recEl.addEventListener('change', () => {
    periodGroup.style.display = recEl.checked ? 'flex' : 'none';
    recLabel.textContent      = recEl.checked ? 'Yes' : 'No';
  });

  // Save
  sheet.querySelector('#ps-save').addEventListener('click', async () => {
    const name   = sheet.querySelector('#ps-name').value.trim();
    const amount = sheet.querySelector('#ps-amount').value.trim();
    const due    = sheet.querySelector('#ps-due').value;

    if (!name)   { alert('Name is required.'); return; }
    if (!amount) { alert('Amount is required.'); return; }
    if (!due)    { alert('Due date is required.'); return; }

    const saveBtn = sheet.querySelector('#ps-save');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    const fields = {
      name,
      category:         sheet.querySelector('#ps-category').value,
      amount:           String(Math.round(parseFloat(amount) || 0)),
      due_date:         due,
      recurring:        recEl.checked ? 'TRUE' : 'FALSE',
      recurring_period: recEl.checked ? sheet.querySelector('#ps-period').value : '',
      status:           isEdit ? sheet.querySelector('#ps-status').value : 'planned',
      last_paid_date:   v('last_paid_date'),
      notes:            sheet.querySelector('#ps-notes').value.trim(),
    };

    try {
      if (isEdit) {
        await updatePlannedExpense(item._row, data.plannedHeaders, fields);
      } else {
        await appendPlannedExpense(data.plannedHeaders, fields);
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
```

- [ ] **Step 2: Commit**

```bash
git add js/pages/planned.js
git commit -m "feat: implement planned expenses management page"
```

---

## Task 4: Dashboard section

**Files:**
- Modify: `js/pages/dashboard.js`

- [ ] **Step 1: Add `computeNextPayday` and `getUpcomingPlanned` helpers**

After the existing `computeDaysUntilPayday` function in `js/pages/dashboard.js`, add:

```js
// Returns the next salary period start_date string after today, or null
function computeNextPayday(salaryPeriods) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...salaryPeriods]
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return sorted[0]?.start_date || null;
}

// Returns planned items that count toward the upcoming total:
//   - one-time:  status=planned, due_date <= nextPayday
//   - recurring: not paid in current billing period, due_date <= nextPayday
function getUpcomingPlanned(planned, salaryPeriods) {
  const today       = new Date().toISOString().slice(0, 10);
  const nextPay     = computeNextPayday(salaryPeriods) || '9999-99-99';
  // billing period start = most recent start_date <= today
  const periodStart = [...salaryPeriods]
    .filter(p => p.start_date && p.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]?.start_date || today;

  return planned.filter(p => {
    if (p.status === 'cancelled' || p.status === 'paid') return false;
    const due = p.due_date || '';
    if (!due || due > nextPay) return false;
    const isRec = p.recurring === 'TRUE' || p.recurring === true;
    if (isRec) {
      const lpd = p.last_paid_date || '';
      return !(lpd >= periodStart && lpd <= today); // not paid this period
    }
    return true; // one-time, due before payday, not paid/cancelled
  });
}
```

- [ ] **Step 2: Compute planned data in `renderPage`**

In `renderPage`, after the `const openReimbursements = getOpenReimbursements(...)` line, add:

```js
  // Planned expenses — upcoming before next payday
  const upcomingPlanned     = getUpcomingPlanned(data.planned || [], data.salaryPeriods);
  const upcomingPlannedTotal = upcomingPlanned.reduce((s, p) => s + parseAmount(p.amount), 0);
  const projectedBalance    = summary.balance - upcomingPlannedTotal;
  const nextPaydayDate      = computeNextPayday(data.salaryPeriods);
```

- [ ] **Step 3: Build `plannedSectionHtml` pre-render string**

After the `owesSectionHtml` variable (in the section where all section HTML strings are built), add:

```js
  const plannedSectionHtml = (() => {
    if (!upcomingPlanned.length) return `
      <div class="section-title">Planned Expenses</div>
      <div class="planned-dash-empty">No upcoming planned expenses</div>`;

    const rows = upcomingPlanned.slice(0, 5).map(p => {
      const emoji = getCategoryEmoji(p.category || '');
      return `<div class="planned-dash-row">
        <span>${emoji}</span>
        <span class="planned-dash-name">${p.name || '—'}</span>
        <span class="planned-dash-amt">−${fmt(parseAmount(p.amount))}</span>
      </div>`;
    }).join('');

    const more = upcomingPlanned.length > 5
      ? `<div class="planned-dash-more">+${upcomingPlanned.length - 5} more</div>` : '';

    return `
      <div class="planned-dash-card" id="planned-dash-card">
        <div class="section-title" style="margin-top:0">Planned Expenses
          <span class="section-hint">${upcomingPlanned.length} upcoming</span>
        </div>
        ${rows}${more}
        <div class="planned-dash-footer">
          <span class="planned-dash-total">Upcoming: −${fmt(upcomingPlannedTotal)}</span>
          <span class="planned-dash-projected">Projected balance: ${fmt(projectedBalance)}</span>
        </div>
      </div>`;
  })();
```

- [ ] **Step 4: Add `planned` to `sectionHtmlMap`**

In `renderPage`, find the `sectionHtmlMap` object and add the `planned` entry:

```js
  const sectionHtmlMap = {
    today:      todayStripHtml,
    spent:      spentCardHtmlInner,
    merchant:   merchantCardHtml,
    budget:     budgetSectionHtml,
    donut:      donutSectionHtml,
    trend:      trendSectionHtml,
    comparison: comparisonSectionHtml,
    weekly:     weeklySectionHtml,
    recurring:  recurringSectionHtml,
    owes:       owesSectionHtml,
    planned:    plannedSectionHtml,   // ← add this
  };
```

- [ ] **Step 5: Add click handler for the planned dashboard card**

In the event-listeners section of `renderPage`, after the owes-row handler, add:

```js
  // Planned dashboard card → planned expenses page
  el.querySelector('#planned-dash-card')?.addEventListener('click', () => {
    navigate('planned');
  });
```

- [ ] **Step 6: Commit**

```bash
git add js/pages/dashboard.js
git commit -m "feat: add planned expenses section to dashboard"
```

---

## Task 5: CSS

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Append planned expenses styles to the end of `css/app.css`**

```css
/* ── Planned Expenses — Dashboard card ───────────────────────────────────── */
.planned-dash-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.planned-dash-card:active { background: var(--surface-2); }

.planned-dash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
}
.planned-dash-row:last-of-type { border-bottom: none; }
.planned-dash-name { flex: 1; color: var(--text); }
.planned-dash-amt  { font-weight: 700; color: var(--red); flex-shrink: 0; }
.planned-dash-more { font-size: 0.75rem; color: var(--text-muted); padding: 4px 0; }

.planned-dash-footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
}
.planned-dash-total     { color: var(--red); font-weight: 600; }
.planned-dash-projected { color: var(--green); font-weight: 700; }
.planned-dash-empty {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
}

/* ── Planned Expenses — Management page ──────────────────────────────────── */
.planned-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 32px;
}
.planned-section { margin: 0 0 4px; }
.planned-empty {
  padding: 32px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.7;
}

.planned-item-wrap {
  position: relative;
}
.planned-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
}
.planned-row:active { background: var(--surface-2); }
.planned-emoji { font-size: 1.2rem; flex-shrink: 0; }
.planned-body  { flex: 1; min-width: 0; }
.planned-main  { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.planned-name  { font-size: 0.88rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.planned-amount { font-size: 0.9rem; font-weight: 700; color: var(--red); flex-shrink: 0; }
.planned-sub   { display: flex; align-items: center; gap: 8px; margin-top: 2px; font-size: 0.75rem; color: var(--text-muted); }
.planned-badge {
  background: rgba(99,102,241,0.15);
  color: var(--primary-2);
  border-radius: 99px;
  padding: 1px 7px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.planned-paid-badge {
  color: var(--green);
  font-size: 0.75rem;
  font-weight: 600;
}
.planned-edit-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.planned-pay-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 0 16px 8px;
  padding: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--green);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s;
}
.planned-pay-btn:active { background: var(--surface-3); }

.planned-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 16px 16px 0;
  padding: 14px;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  border: none;
  border-radius: 16px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
.planned-add-btn:active { opacity: 0.85; }

.planned-cancelled {
  margin: 8px 0;
}
.planned-cancelled summary {
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/app.css
git commit -m "feat: add CSS for planned expenses dashboard card and page"
```

---

## Task 6: Docs + version bump

**Files:**
- Modify: `FEATURES.md`
- Modify: `index.html`
- Modify: `sw.js`

- [ ] **Step 1: Add Planned Expenses section to `FEATURES.md`**

After the `## Owes You` subsection (under Overview Dashboard), add a new subsection:

```markdown
### Planned Expenses (Dashboard section)
- Configurable section on the Dashboard (can be hidden in Dashboard Settings)
- Shows up to 5 upcoming planned expenses due before the next payday
- Displays total upcoming amount and **Projected Balance** (current balance − upcoming total)
- Tapping the card opens the Planned Expenses management page
```

Then add a new top-level section after `## Merchants`:

```markdown
---

## Planned Expenses

- Manage upcoming committed bills and planned purchases
- Accessible via the Dashboard section or ⋮ menu → Planned Expenses
- Data stored in the **Planned Expenses** Google Sheets tab (pure data, no formulas)

### Item types
- **One-time** — a specific future purchase or bill; disappears from Upcoming once marked paid
- **Recurring** — monthly/quarterly/yearly items (e.g. subscriptions, rent); always visible in the Recurring section; "Mark as paid" records the current-period payment without removing the item

### Sections
- **Upcoming** — due before the next payday and not yet paid this period
- **Recurring** — all recurring items; shows "✓ Paid" badge when paid this billing period
- **Later** — one-time items due after the next payday
- **Paid** — completed one-time items
- **Cancelled** — collapsed at the bottom

### Add / Edit
- Fields: Name, Amount (Kč), Category, Due date, Recurring toggle, Recurring period (monthly/quarterly/yearly), Notes
- Save writes directly to the Planned Expenses sheet

### Mark as paid
- One-time: sets `status = paid` in the sheet
- Recurring: writes `last_paid_date = today`; item remains active and resets automatically next period

### Projected Balance
- Shown on the Dashboard planned section
- Formula: current period Balance − sum of upcoming unpaid planned amounts
```

- [ ] **Step 2: Bump to v20**

```bash
sed -i '' 's/app\.css?v=19/app.css?v=20/g; s/app\.js?v=19/app.js?v=20/g' index.html
sed -i '' 's/finance-v19/finance-v20/' sw.js
```

- [ ] **Step 3: Commit**

```bash
git add FEATURES.md index.html sw.js
git commit -m "docs: document planned expenses feature, bump to v20"
```

---

## Self-Review

**Spec coverage:**
- ✅ AC1 — Planned sheet loaded in `loadData`; write functions `updatePlannedExpense` + `appendPlannedExpense` added (Task 1)
- ✅ AC2 — Dashboard section with upcoming list + projected balance; configurable via settings (Tasks 2, 4)
- ✅ AC3 — Management page with Upcoming / Recurring / Later / Paid / Cancelled sections; "+" add button; tap-to-edit; mark-as-paid (Task 3)
- ✅ AC4 — Add/Edit bottom sheet with all required fields; save via append/batchUpdate (Task 3)
- ✅ AC5 — Mark as paid: one-time → status=paid; recurring → last_paid_date=today (Task 3)
- ✅ AC6 — Projected Balance displayed in dashboard planned section; formula correct (Task 4)
- ✅ Menu entry "Planned Expenses" (Task 2)
- ✅ FEATURES.md updated (Task 6)
- ✅ Version bumped (Task 6)

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `updatePlannedExpense(row, plannedHeaders, fields)` — used in Task 3 (`data.plannedHeaders`) and Task 3 mark-as-paid ✓
- `appendPlannedExpense(plannedHeaders, fields)` — used in Task 3 save handler (`data.plannedHeaders`) ✓
- `computeNextPayday(salaryPeriods)` defined in Task 4 Step 1, used in Task 4 Step 2 ✓
- `getUpcomingPlanned(planned, salaryPeriods)` defined in Task 4 Step 1, used in Task 4 Step 2 ✓
- `data.planned` — added to `loadData` return in Task 1 Step 2; consumed in Tasks 3 and 4 ✓
- `data.plannedHeaders` — added to `loadData` return in Task 1 Step 2; consumed in Tasks 3 and 4 ✓
