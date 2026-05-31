# Editable Budget Amounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit, set, or remove the monthly budget amount for any category directly from the Dashboard budget cards via a pencil icon that opens a bottom sheet.

**Architecture:** Three new functions added to `api.js` (expose `budgetHeaders`, update a cell, append a row). `dashboard.js` gains a pencil button on each budget card and a new `openBudgetEditSheet` function modelled on the existing `openEditSheet` pattern. No new pages or routes — the edit sheet is a self-contained overlay rendered into the DOM.

**Tech Stack:** Vanilla ES Modules, Google Sheets API v4 (`batchUpdate` + `append`), existing `.sheet-*` CSS classes.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Modify | `js/api.js` | Return `budgetHeaders` from `loadData`; add `updateBudgetAmount`; add `appendBudgetRow` |
| Modify | `js/pages/dashboard.js` | Preserve `_row` in `computeBudgetProgress`; pencil icon in card HTML; guard card click; pencil click handler; `openBudgetEditSheet` function |
| Modify | `css/app.css` | `.budget-edit-btn` styles |
| Modify | `FEATURES.md` | Document budget editing |
| Modify | `index.html` + `sw.js` | Bump cache version to v12 |

---

## Task 1: API — expose budgetHeaders and write functions

**Files:**
- Modify: `js/api.js`

The Budgets sheet has columns `Category` (col A) and `Monthly Budget` (col B) as a minimum. `fetchRange` already attaches `_row` to every row it returns, but `loadData` throws away `budgetsResult.headers`. We need that header array so write functions can locate the right column index.

- [ ] **Step 1: Add `budgetHeaders` to `loadData` return**

Find the `return { ... }` inside the `withAuth` callback in `loadData` (around line 64). The current object is:
```js
    return {
      transactions:  txResult.rows,
      txHeaders:     txResult.headers,
      budgets:       budgetsResult.rows,
      salaryPeriods: spResult.rows,
      loadedAt:      Date.now(),
    };
```
Change it to:
```js
    return {
      transactions:  txResult.rows,
      txHeaders:     txResult.headers,
      budgets:       budgetsResult.rows,
      budgetHeaders: budgetsResult.headers,
      salaryPeriods: spResult.rows,
      loadedAt:      Date.now(),
    };
```

- [ ] **Step 2: Add `updateBudgetAmount` export**

Append after the `appendTransaction` function at the bottom of `js/api.js`:
```js
// Update the Monthly Budget cell for an existing budget row.
// amount: number or '' (empty string clears / removes the budget).
export async function updateBudgetAmount(row, budgetHeaders, amount) {
  const idx = budgetHeaders.indexOf('Monthly Budget');
  if (idx === -1) throw new Error('"Monthly Budget" column not found in Budgets sheet');

  await withAuth(async token => {
    const url  = `${BASE}/values:batchUpdate`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [{ range: `${SHEETS.budgets}!${colLetter(idx)}${row}`, values: [[amount]] }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Update failed: ${resp.status}`);
    }
  });

  clearCache();
}
```

- [ ] **Step 3: Add `appendBudgetRow` export**

Append after `updateBudgetAmount` at the bottom of `js/api.js`:
```js
// Append a new row to the Budgets sheet for a previously-unbudgeted category.
export async function appendBudgetRow(budgetHeaders, category, amount) {
  const rowValues = budgetHeaders.map(h => {
    if (h === 'Category')       return category;
    if (h === 'Monthly Budget') return amount;
    return '';
  });

  await withAuth(async token => {
    const url  = `${BASE}/values/${encodeURIComponent(SHEETS.budgets)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowValues] }),
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
git add js/api.js
git commit -m "feat: expose budgetHeaders and add budget write functions"
```

---

## Task 2: Dashboard — preserve _row, pencil icon, click wiring

**Files:**
- Modify: `js/pages/dashboard.js`

Three sub-changes, all in the same file.

- [ ] **Step 1: Add imports for new API functions**

At the top of `js/pages/dashboard.js`, the current import from `api.js` is:
```js
import { loadData, clearCache } from '../api.js';
```
Change to:
```js
import { loadData, clearCache, updateBudgetAmount, appendBudgetRow } from '../api.js';
```

- [ ] **Step 2: Preserve `_row` in `computeBudgetProgress`**

Find the `.map(b => ({` inside `computeBudgetProgress` (around line 85). Currently:
```js
  const result = budgets
    .filter(b => b.Category)
    .map(b => ({
      category: b.Category,
      budget:   parseAmount(b['Monthly Budget']),
      actual:   actualByCategory[b.Category] || 0,
    }))
```
Change to:
```js
  const result = budgets
    .filter(b => b.Category)
    .map(b => ({
      category: b.Category,
      budget:   parseAmount(b['Monthly Budget']),
      actual:   actualByCategory[b.Category] || 0,
      _row:     b._row,
    }))
```
The unbudgeted-category entries pushed later (`result.push({ category: cat, budget: 0, actual })`) will naturally have `_row: undefined`, which is the signal to use `appendBudgetRow` instead of `updateBudgetAmount`.

- [ ] **Step 3: Add pencil icon to each budget card HTML**

In `renderPage`, find the budget card HTML builder (around line 488). The current card starts with:
```js
          return '<div class="budget-card" data-category="' + b.category + '" data-period="' + period + '" data-mode="' + mode + '">'
            + '<div class="budget-card-top">'
            + '<span class="budget-card-icon" style="background:' + iconColor + '22;border:1px solid ' + iconColor + '44">' + emoji + '</span>'
            + '</div>'
```
Change to:
```js
          return '<div class="budget-card" data-category="' + b.category + '" data-period="' + period + '" data-mode="' + mode + '">'
            + '<div class="budget-card-top">'
            + '<span class="budget-card-icon" style="background:' + iconColor + '22;border:1px solid ' + iconColor + '44">' + emoji + '</span>'
            + '<button class="budget-edit-btn" data-category="' + b.category + '" aria-label="Edit budget for ' + b.category + '">'
            + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
            + '</button>'
            + '</div>'
```

- [ ] **Step 4: Guard the budget-card click and add pencil click handler**

Find the existing budget-card click handler (around line 644):
```js
  // Budget cards → transactions filtered by category + period
  el.querySelectorAll('.budget-card').forEach(card => {
    card.addEventListener('click', () => {
      navigate('transactions', {
        category: card.dataset.category,
        period:   card.dataset.period,
      });
    });
  });
```
Replace with:
```js
  // Budget cards → transactions filtered by category + period
  // (ignore clicks that originated on the pencil edit button)
  el.querySelectorAll('.budget-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.budget-edit-btn')) return;
      navigate('transactions', {
        category: card.dataset.category,
        period:   card.dataset.period,
      });
    });
  });

  // Pencil icon → budget edit sheet
  el.querySelectorAll('.budget-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cat         = btn.dataset.category;
      const budgetEntry = budget.find(b => b.category === cat);
      if (budgetEntry) openBudgetEditSheet(budgetEntry, data, el);
    });
  });
```

- [ ] **Step 5: Commit**

```bash
git add js/pages/dashboard.js
git commit -m "feat: add pencil icon to budget cards and wire click handlers"
```

---

## Task 3: Dashboard — openBudgetEditSheet function

**Files:**
- Modify: `js/pages/dashboard.js`

Add the `openBudgetEditSheet` function at the bottom of `js/pages/dashboard.js`, after the last existing function.

- [ ] **Step 1: Append `openBudgetEditSheet` to the end of `js/pages/dashboard.js`**

```js
// ── Budget edit bottom sheet ──────────────────────────────────────────────────

function openBudgetEditSheet(b, data, el) {
  const emoji        = getCategoryEmoji(b.category);
  const hasExisting  = b._row !== undefined && b.budget > 0;
  const isNew        = b._row === undefined;

  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-panel" id="budget-sheet-panel">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <div class="sheet-title">${emoji} ${b.category}</div>
          <div class="sheet-subtitle">Monthly budget${isNew ? ' · no budget set yet' : ''}</div>
        </div>
      </div>
      <div class="sheet-fields">
        <div class="field-group">
          <label class="field-label" for="budget-amount-input">Budget amount (Kč)</label>
          <input
            id="budget-amount-input"
            class="field-input"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 5000"
            value="${b.budget > 0 ? b.budget : ''}"
          >
        </div>
      </div>
      <div class="sheet-actions">
        <button class="btn-secondary" id="budget-sheet-cancel">Cancel</button>
        ${hasExisting ? '<button class="btn-remove" id="budget-sheet-remove">Remove</button>' : ''}
        <button class="btn-save" id="budget-sheet-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  const panel     = sheet.querySelector('#budget-sheet-panel');
  const input     = sheet.querySelector('#budget-amount-input');
  const saveBtn   = sheet.querySelector('#budget-sheet-save');
  const cancelBtn = sheet.querySelector('#budget-sheet-cancel');
  const removeBtn = sheet.querySelector('#budget-sheet-remove');

  requestAnimationFrame(() => panel.classList.add('open'));

  const close = () => {
    panel.classList.remove('open');
    setTimeout(() => sheet.remove(), 280);
  };

  sheet.querySelector('.sheet-backdrop').addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  saveBtn.addEventListener('click', async () => {
    const raw    = input.value.trim();
    if (raw === '' && isNew) { close(); return; } // nothing to save for a new entry with no value
    const amount = raw === '' ? '' : Math.round(parseFloat(raw) || 0);

    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    try {
      if (isNew) {
        await appendBudgetRow(data.budgetHeaders, b.category, amount);
      } else {
        await updateBudgetAmount(b._row, data.budgetHeaders, amount);
      }
      close();
      renderDashboard(el);
    } catch (err) {
      saveBtn.textContent = 'Save';
      saveBtn.disabled    = false;
      alert(`Failed to save: ${err.message}`);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      removeBtn.textContent = 'Removing…';
      removeBtn.disabled    = true;

      try {
        await updateBudgetAmount(b._row, data.budgetHeaders, '');
        close();
        renderDashboard(el);
      } catch (err) {
        removeBtn.textContent = 'Remove';
        removeBtn.disabled    = false;
        alert(`Failed to remove: ${err.message}`);
      }
    });
  }

  // Auto-focus after animation
  setTimeout(() => input.focus(), 300);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/pages/dashboard.js
git commit -m "feat: implement openBudgetEditSheet with save/remove"
```

---

## Task 4: CSS — pencil icon button + remove button styles

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Append styles to the end of `css/app.css`**

```css
/* ── Budget edit button (pencil icon on card) ────────────────────────────── */
.budget-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.budget-edit-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-muted);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.budget-edit-btn:active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

/* Remove budget button in edit sheet */
.btn-remove {
  flex: 1;
  padding: 13px;
  background: transparent;
  border: 1px solid var(--red);
  border-radius: 14px;
  color: var(--red);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-remove:active  { background: rgba(244, 63, 94, 0.1); }
.btn-remove:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 2: Commit**

```bash
git add css/app.css
git commit -m "feat: add CSS for budget pencil button and remove button"
```

---

## Task 5: Version bump + FEATURES.md

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `FEATURES.md`

- [ ] **Step 1: Bump version in `index.html`**

Change both occurrences of `?v=11` to `?v=12`:
```html
<link rel="stylesheet" href="css/app.css?v=12">
```
```html
<script type="module" src="js/app.js?v=12"></script>
```

- [ ] **Step 2: Bump service worker cache in `sw.js`**

```js
const CACHE = 'finance-v12';
```

- [ ] **Step 3: Update `FEATURES.md` — Budget vs Actual section**

Find the existing `### Budget vs Actual` section. The current bullets are:
```markdown
### Budget vs Actual
- 2-column grid of budget cards, one per category
- Each card: category emoji, name, amount spent, budget limit ("of X Kč"), progress bar
- Progress bar colours: green (≤ 80 %), yellow (80–100 %), red (over budget)
- Period-elapsed indicator: % of billing period elapsed shown next to section title
- Tap any card → Records filtered to that category + period
```
Replace with:
```markdown
### Budget vs Actual
- 2-column grid of budget cards, one per category
- Each card: category emoji, name, amount spent, budget limit ("of X Kč"), progress bar
- Progress bar colours: green (≤ 80 %), yellow (80–100 %), red (over budget)
- Period-elapsed indicator: % of billing period elapsed shown next to section title
- Tap any card → Records filtered to that category + period
- **Pencil icon** (top-right of each card) → opens budget edit sheet
  - Set or change the monthly budget amount for any category
  - Categories with no budget row yet: saving appends a new row to the Budgets sheet
  - **Remove budget** button clears the budget value (only shown when a budget exists)
```

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js FEATURES.md
git commit -m "chore: bump to v12, document editable budgets in FEATURES.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ Pencil icon trigger on every budget card (Task 2, Step 3)
- ✅ Edit sheet: category name read-only, amount input pre-filled (Task 3)
- ✅ Save for existing budget: `updateBudgetAmount` (Task 3)
- ✅ Save for unbudgeted category: `appendBudgetRow` (Task 3)
- ✅ Remove budget: only shown when `hasExisting` = `b._row !== undefined && b.budget > 0` (Task 3)
- ✅ Remove sets cell to `''` (Task 3)
- ✅ Dismiss via backdrop (Task 3)
- ✅ `_row` preserved in `computeBudgetProgress` (Task 2, Step 2)
- ✅ `budgetHeaders` exposed from `loadData` (Task 1, Step 1)
- ✅ Existing card tap → Records not broken (Task 2, Step 4 guards with `e.target.closest`)
- ✅ CSS for button (Task 4)
- ✅ FEATURES.md updated (Task 5)

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:**
- `openBudgetEditSheet(b, data, el)` — `b` has `{ category, budget, actual, _row? }` — matches `budget.find(b => b.category === cat)` call in Task 2 Step 4
- `updateBudgetAmount(row, budgetHeaders, amount)` — `row = b._row`, `budgetHeaders = data.budgetHeaders`, `amount = Math.round(...) | ''` — matches function signature in Task 1 Step 2
- `appendBudgetRow(budgetHeaders, category, amount)` — matches Task 1 Step 3 signature
- `renderDashboard(el)` — called after save/remove; `renderDashboard` is already in scope in `dashboard.js` ✅
