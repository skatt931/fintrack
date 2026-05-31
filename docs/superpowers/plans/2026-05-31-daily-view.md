# Daily View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-day expense view reachable by tapping date headers in Records or a "Today" strip on the Dashboard.

**Architecture:** New `daily.js` page renders one calendar day at a time with ← → navigation. `openEditSheet` is exported from `transactions.js` so the daily page can reuse the same edit bottom sheet. Dashboard gets a compact Today strip; Records date headers become tappable navigation links.

**Tech Stack:** Vanilla ES Modules, Chart.js (not used here), Google Sheets API via existing `loadData()`, Intl.DateTimeFormat for date formatting.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `js/pages/daily.js` | New daily view page |
| Modify | `js/pages/transactions.js` | Export `openEditSheet`; make date headers tappable |
| Modify | `js/pages/dashboard.js` | Add `normDateKey` helper, compute Today data, render Today strip, add click handler |
| Modify | `js/router.js` | Add `daily` to `PAGE_TITLES` |
| Modify | `js/app.js` | Import + register `renderDaily` |
| Modify | `css/app.css` | Today strip + daily page styles |
| Modify | `index.html` | Bump cache-bust version `?v=10` → `?v=11` |
| Modify | `sw.js` | Bump service worker cache `finance-v10` → `finance-v11` |
| Modify | `FEATURES.md` | Document Daily View |

---

## Task 1: Register the daily route

**Files:**
- Modify: `js/router.js`
- Modify: `js/app.js`

- [ ] **Step 1: Add `daily` to PAGE_TITLES in `js/router.js`**

Open `js/router.js`. The current `PAGE_TITLES` object is:
```js
const PAGE_TITLES = {
  dashboard:    'Overview',
  transactions: 'Records',
  add:          'Add Expense',
  breakdown:    'Spending',
  merchants:    'Merchants',
};
```
Change it to:
```js
const PAGE_TITLES = {
  dashboard:    'Overview',
  transactions: 'Records',
  add:          'Add Expense',
  breakdown:    'Spending',
  merchants:    'Merchants',
  daily:        'Daily View',
};
```

- [ ] **Step 2: Import and register `renderDaily` in `js/app.js`**

Add to the import block at the top (after the merchants import):
```js
import { renderDaily } from './pages/daily.js';
```

Add to `startApp()` after `register('merchants', renderMerchants);`:
```js
register('daily', renderDaily);
```

The full `startApp` function becomes:
```js
function startApp() {
  register('dashboard',    renderDashboard);
  register('transactions', renderTransactions);
  register('add',          renderAdd);
  register('breakdown',    renderBreakdown);
  register('merchants',    renderMerchants);
  register('daily',        renderDaily);
  initRouter('dashboard');
}
```

- [ ] **Step 3: Create the stub file so the import doesn't break**

Create `js/pages/daily.js` with just the export (full implementation in Task 2):
```js
export function renderDaily(el, params = {}) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>';
}
```

- [ ] **Step 4: Open the app and confirm it still loads without errors**

Open `index.html` in a browser (or the running dev server). Sign in, navigate all tabs — no JS console errors. The Daily View can't be reached yet; that's expected.

---

## Task 2: Create the full daily view page

**Files:**
- Create/Modify: `js/pages/daily.js`
- Modify: `js/pages/transactions.js` (export `openEditSheet`)

- [ ] **Step 1: Export `openEditSheet` from `js/pages/transactions.js`**

Find the line (around line 342):
```js
function openEditSheet(txn, data, pageEl) {
```
Change `function` to `export function`:
```js
export function openEditSheet(txn, data, pageEl) {
```
No other changes to `transactions.js` in this step.

- [ ] **Step 2: Write the full `js/pages/daily.js`**

Replace the stub completely with:

```js
import { loadData } from '../api.js';
import { navigate } from '../router.js';
import { categoryBadge } from '../categoryIcons.js';
import { openEditSheet } from './transactions.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function fmt(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n) + ' Kč';
}

// Normalise any date string to YYYY-MM-DD
function normDateKey(str) {
  if (!str) return '';
  const s = str.trim();
  const eu = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return s.slice(0, 10);
}

// "2026-05-16" → "Thursday, 16 May 2026"
function fmtDayFull(str) {
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// "2026-05-16" → "Thu, 16 May"  (compact, for page title)
function fmtDayShort(str) {
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Add N days to a YYYY-MM-DD string, return YYYY-MM-DD
function addDays(str, n) {
  const d = new Date(str + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Page entry ────────────────────────────────────────────────────────────────

export function renderDaily(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  const date = params.date || new Date().toISOString().slice(0, 10);

  loadData()
    .then(data => {
      const txns = data.transactions.filter(t =>
        t.direction === 'expense' && normDateKey(t.date) === date
      );
      renderPage(el, date, txns, data);
    })
    .catch(err => {
      el.innerHTML = `<div class="daily-page"><div class="error-msg">${err.message}</div></div>`;
    });
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPage(el, date, txns, data) {
  const today    = new Date().toISOString().slice(0, 10);
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const isToday  = date === today;
  const isFuture = date > today;

  const total = txns.reduce((s, t) => s + parseAmount(t.report_amount), 0);

  // Top 3 categories by spend — shown as emoji badges in the header
  const byCat = {};
  for (const t of txns) {
    const cat = t.category || 'Uncategorized';
    byCat[cat] = (byCat[cat] || 0) + parseAmount(t.report_amount);
  }
  const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 3);

  el.innerHTML = `
    <div class="daily-page">

      <!-- Date navigation -->
      <div class="daily-nav">
        <button class="daily-nav-btn" id="prev-day" aria-label="Previous day">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="daily-nav-label">
          ${isToday ? '<span class="daily-today-badge">Today</span>' : ''}
          <span class="daily-nav-date">${fmtDayFull(date)}</span>
        </div>
        <button class="daily-nav-btn" id="next-day" aria-label="Next day" ${isFuture ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- Summary header -->
      ${txns.length > 0 ? `
      <div class="daily-header">
        <div class="daily-total">${fmt(total)}</div>
        <div class="daily-cat-chips">
          ${topCats.map(([cat]) => categoryBadge(cat, 'sm')).join('')}
        </div>
      </div>` : ''}

      <!-- Back link -->
      <button class="bp-back" id="daily-back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Overview
      </button>

      <!-- Transaction list -->
      <div class="txn-list">
        ${txns.length > 0 ? txns.map(t => {
          const amt      = parseAmount(t.report_amount);
          const merchant = t.merchant || t.description || t.note || t.Merchant || '';
          const review   = t.needs_review === 'TRUE' || t.needs_review === true;
          return `
          <div class="txn-item" data-row="${t._row}">
            ${categoryBadge(t.category, 'sm')}
            <div class="txn-body">
              <div class="txn-main">
                <span class="txn-category">${t.category || '—'}</span>
                <span class="txn-amount expense">−${fmt(amt)}</span>
              </div>
              <div class="txn-sub">
                <span>${t.bank || '—'}</span>
                ${merchant ? `<span class="txn-merchant">${merchant}</span>` : ''}
                ${review   ? '<span class="txn-badge review">Review</span>' : ''}
              </div>
            </div>
          </div>`;
        }).join('') : `
        <div class="daily-empty">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Nothing spent on this day.</span>
        </div>`}
      </div>

    </div>
  `;

  // ── Events ─────────────────────────────────────────────────────────────────

  el.querySelector('#prev-day').addEventListener('click', () => {
    navigate('daily', { date: prevDate });
  });

  el.querySelector('#next-day').addEventListener('click', () => {
    if (!isFuture) navigate('daily', { date: nextDate });
  });

  el.querySelector('#daily-back').addEventListener('click', () => {
    navigate('dashboard');
  });

  el.querySelectorAll('.txn-item').forEach(item => {
    item.addEventListener('click', () => {
      const row = parseInt(item.dataset.row);
      const txn = data.transactions.find(t => t._row === row);
      if (txn) openEditSheet(txn, data, el);
    });
  });
}
```

- [ ] **Step 3: Verify the page loads via direct navigation**

In `js/app.js`, temporarily change `initRouter('dashboard')` to `initRouter('daily')`, open the app, confirm the daily page renders (either with transactions or "Nothing spent" empty state), then revert the change.

---

## Task 3: Today strip on Dashboard

**Files:**
- Modify: `js/pages/dashboard.js`

- [ ] **Step 1: Add `normDateKey` helper near the top of `dashboard.js`**

After the `fmtMonth` function (around line 255), add:
```js
// Normalise any date string to YYYY-MM-DD (handles DD/MM/YYYY and ISO variants)
function normDateKey(str) {
  if (!str) return '';
  const s = str.trim();
  const eu = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return s.slice(0, 10);
}
```

- [ ] **Step 2: Compute Today strip data in `renderPage`**

In `renderPage`, after the `const recurring = detectRecurring(...)` line (around line 305), add:

```js
// Today strip — always uses today's real date, regardless of period view
const todayStr   = new Date().toISOString().slice(0, 10);
const todayTxns  = data.transactions.filter(t =>
  t.direction === 'expense' && normDateKey(t.date) === todayStr
);
const todayTotal = todayTxns.reduce((s, t) => s + parseAmount(t.report_amount), 0);
const todayByCat = {};
for (const t of todayTxns) {
  const cat = t.category || 'Uncategorized';
  todayByCat[cat] = (todayByCat[cat] || 0) + parseAmount(t.report_amount);
}
const todayCats = Object.entries(todayByCat).sort(([, a], [, b]) => b - a).slice(0, 3);

const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const todayStripHtml = `
  <div class="today-strip" id="today-strip">
    <div class="today-strip-left">
      <span class="today-strip-label">TODAY</span>
      <span class="today-strip-date">${todayLabel}</span>
    </div>
    <div class="today-strip-right">
      ${todayTxns.length > 0
        ? `<span class="today-strip-total">${fmt(todayTotal)}</span>
           <div class="today-strip-cats">${todayCats.map(([cat]) => getCategoryEmoji(cat)).join(' ')}</div>`
        : `<span class="today-strip-empty">Nothing spent</span>`
      }
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>
`;
```

- [ ] **Step 3: Insert the Today strip into the HTML template**

In the `el.innerHTML = \`...\`` template in `renderPage`, find the summary grid section:
```html
      <!-- Summary cards -->
      <div class="summary-grid">
```
Insert the Today strip **after** the closing `</div>` of the summary grid (after `</div>` on the line after `card-savings`):
```html
      <!-- Summary cards -->
      <div class="summary-grid">
        ...
      </div>

      <!-- Today strip -->
      ${todayStripHtml}

      <!-- Spent in billing period card -->
      ${spentCardHtml}
```

- [ ] **Step 4: Add the click handler for the Today strip**

In the event-listeners section of `renderPage`, after the existing card click handlers, add:
```js
// Today strip → daily view for today
el.querySelector('#today-strip')?.addEventListener('click', () => {
  navigate('daily', { date: new Date().toISOString().slice(0, 10) });
});
```

---

## Task 4: Tappable date headers in Records

**Files:**
- Modify: `js/pages/transactions.js`

- [ ] **Step 1: Change date header HTML from `div` to `button`**

In `renderPage` in `transactions.js`, find the transaction list template (around line 258):
```js
        ${groups.length ? groups.map(([day, items]) => `
          <div class="txn-date-header">${fmtDateGroup(day)}</div>
```
Change to:
```js
        ${groups.length ? groups.map(([day, items]) => `
          <button class="txn-date-header txn-date-header--link" data-date="${day}">${fmtDateGroup(day)} →</button>
```

- [ ] **Step 2: Wire up the click handler**

In the events section of `renderPage` (after the existing row-tap handler), add:
```js
  // Date header tap → daily view
  el.querySelectorAll('.txn-date-header--link').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate('daily', { date: btn.dataset.date });
    });
  });
```

---

## Task 5: CSS styles

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Append the following styles to the end of `css/app.css`**

```css
/* ── Today Strip (Dashboard) ─────────────────────────────────────────────── */
.today-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 16px;
  margin: 0 16px 10px;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.today-strip:active { background: var(--surface-2); }

.today-strip-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.today-strip-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--primary-2);
  letter-spacing: 0.08em;
}
.today-strip-date {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.today-strip-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.today-strip-total {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--red);
}
.today-strip-cats {
  font-size: 1rem;
  letter-spacing: 2px;
}
.today-strip-empty {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
}

/* ── Daily View Page ─────────────────────────────────────────────────────── */
.daily-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 24px;
}

.daily-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 8px;
  gap: 8px;
}
.daily-nav-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.daily-nav-btn:active { background: var(--surface-2); }
.daily-nav-btn:disabled { opacity: 0.3; pointer-events: none; }

.daily-nav-label {
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.daily-today-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--primary-2);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.daily-nav-date {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}

.daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 20px 12px;
  gap: 12px;
}
.daily-total {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--red);
  letter-spacing: -0.02em;
}
.daily-cat-chips {
  display: flex;
  gap: 6px;
  align-items: center;
}

.daily-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* Tappable date headers in Records */
.txn-date-header--link {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  -webkit-tap-highlight-color: transparent;
  transition: color 0.15s;
  padding: 14px 2px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.txn-date-header--link:active { color: var(--text); }
.txn-date-header--link:first-child { padding-top: 4px; }
```

---

## Task 6: Version bump + FEATURES.md

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `FEATURES.md`

- [ ] **Step 1: Bump cache-bust version in `index.html`**

Change both occurrences of `?v=10` to `?v=11`:
```html
  <link rel="stylesheet" href="css/app.css?v=11">
```
```html
  <script type="module" src="js/app.js?v=11"></script>
```

- [ ] **Step 2: Bump service worker cache version in `sw.js`**

Change:
```js
const CACHE = 'finance-v10';
```
To:
```js
const CACHE = 'finance-v11';
```

- [ ] **Step 3: Update `FEATURES.md`**

Under the **Navigation** section, update the table to mention Daily View:

```markdown
| Tab | Page |
|-----|------|
| Overview | Dashboard |
| Records | Transaction list |
| Add | New transaction form |
| Spending | Category breakdown |
| Merchants | Merchant breakdown |
```

Add after the table:

```markdown
The Daily View page is accessible by:
- Tapping any date header in the Records list
- Tapping the **Today strip** on the Overview dashboard
```

Then add a new top-level section after **Records**:

````markdown
---

## Daily View

- Shows all **expense** transactions for a single calendar day
- Accessed by tapping a date header in Records, or the Today strip on Overview
- **Date navigation** — ← → buttons step through every calendar day (including days with no transactions)
- **Header** — total expenses for the day + up to 3 category emoji chips
- **Empty state** — "Nothing spent on this day." shown for days with no expense transactions
- **Transaction rows** — same style as Records; tap any row to open the edit bottom sheet
- Future dates are disabled in the → navigation button

### Today Strip (Overview Dashboard)

- Compact strip below the Summary Cards on the Dashboard
- Shows today's date, total expenses today, and top category emojis
- Tapping opens the Daily View for today
- Shows "Nothing spent" when no expense transactions exist for today
````

- [ ] **Step 4: Final smoke test**

1. Open the app, navigate to **Records** — date headers show a `→` suffix and are tappable
2. Tap a date header — Daily View opens for that date, showing expense transactions
3. Tap ← and → — navigates day by day; days with no transactions show empty state; today's date shows "Today" badge; future dates have → disabled
4. Tap a transaction row in Daily View — edit bottom sheet slides up correctly
5. Return to Overview — Today strip visible below summary cards
6. Tap Today strip — Daily View for today opens
7. Hard-reload the page (Ctrl+Shift+R) — service worker update kicks in, no stale assets

---

## Self-Review

**Spec coverage:**
- ✅ Daily view page with expense transactions
- ✅ ← → navigation through all calendar days (including empty)
- ✅ Empty state: "Nothing spent on this day"
- ✅ Expenses only (filtered by `direction === 'expense'`)
- ✅ Transaction rows tappable → edit sheet via exported `openEditSheet`
- ✅ Entry point 1: Today strip on Dashboard (below summary cards, compact, shows total + emoji chips)
- ✅ Entry point 2: Tappable date headers in Records

**Placeholder scan:** No TBDs, all code blocks are complete.

**Type consistency:** `normDateKey`, `parseAmount`, `fmt` defined independently in `daily.js` and `dashboard.js` (intentional — no new shared module to keep scope tight). `openEditSheet` exported from `transactions.js` and imported in `daily.js` — signature `(txn, data, pageEl)` matches usage in both files.
