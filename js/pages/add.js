import { loadData, appendTransaction, clearCache } from '../api.js';
import { navigate } from '../router.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}


// ── Render ────────────────────────────────────────────────────────────────────

export function renderAdd(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;
  loadData().then(data => renderForm(el, data, params)).catch(err => {
    el.innerHTML = `<div class="add-page"><div class="error-msg">${err.message}</div></div>`;
  });
}

function renderForm(el, data, params) {
  const categories = [
    ...new Set([
      ...data.budgets.map(b => b.Category).filter(Boolean),
      ...data.budgets.map(b => b.all_categories).filter(Boolean),
    ])
  ].sort();

  const banks = [...new Set(data.transactions.map(t => t.bank).filter(Boolean))].sort();

  el.innerHTML = `
    <div class="add-page-form">

      <!-- Direction toggle -->
      <div class="add-type-toggle">
        <button class="type-btn active" data-type="expense">Expense</button>
        <button class="type-btn" data-type="income">Income</button>
      </div>

      <!-- Amount hero -->
      <div class="add-amount-wrap">
        <span class="add-currency">CZK</span>
        <input
          id="add-amount"
          type="number"
          inputmode="decimal"
          placeholder="0"
          min="0"
          step="0.01"
          class="add-amount-input"
          autofocus
        >
      </div>

      <!-- Fields -->
      <div class="add-fields">

        <div class="field-group">
          <label class="field-label">Category</label>
          <select id="add-cat" class="field-select">
            <option value="">— pick a category —</option>
            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>

        <div class="field-group">
          <label class="field-label">Bank / Source</label>
          <input id="add-bank" class="field-input" type="text" list="bank-list" placeholder="e.g. CSOB, Cash…">
          <datalist id="bank-list">
            ${banks.map(b => `<option value="${b}">`).join('')}
          </datalist>
        </div>

        <div class="field-group">
          <label class="field-label">Date</label>
          <input id="add-date" class="field-input" type="date" value="${todayISO()}">
        </div>

        <div class="field-group">
          <label class="field-label">Note <span class="field-optional">(optional)</span></label>
          <input id="add-note" class="field-input" type="text" placeholder="Merchant, description…">
        </div>

      </div>

      <div id="add-error" class="error-msg" style="display:none"></div>

      <button class="btn-submit" id="add-submit">Add Transaction</button>

    </div>
  `;

  // Track type
  let currentType = 'expense';
  el.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      el.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
      el.querySelector('.add-amount-wrap').classList.toggle('income-mode', currentType === 'income');
    });
  });

  el.querySelector('#add-submit').addEventListener('click', async () => {
    const amountRaw = parseFloat(el.querySelector('#add-amount').value);
    const category  = el.querySelector('#add-cat').value;
    const bank      = el.querySelector('#add-bank').value.trim();
    const dateVal   = el.querySelector('#add-date').value;
    const note      = el.querySelector('#add-note').value.trim();

    const errEl = el.querySelector('#add-error');
    errEl.style.display = 'none';

    if (!amountRaw || amountRaw <= 0) { showErr(errEl, 'Enter a valid amount.'); return; }
    if (!category)                    { showErr(errEl, 'Pick a category.'); return; }
    if (!bank)                        { showErr(errEl, 'Enter a bank or source.'); return; }
    if (!dateVal)                      { showErr(errEl, 'Pick a date.'); return; }

    const btn = el.querySelector('#add-submit');
    btn.textContent = 'Adding…';
    btn.disabled    = true;

    const dateTime = `${dateVal} 00:00:00`;

    // Only write the columns the user explicitly filled in.
    // month, billing_period, and report_amount are intentionally omitted —
    // they are formula / auto-computed columns in the sheet. Writing any value
    // to them (even a correctly-formatted one) overwrites the formula and
    // makes those rows use a different format than the rest, breaking period
    // filtering for all transactions.
    const fields = {
      email_id:     'manual',
      date:         dateTime,
      bank:         bank,
      direction:    currentType,
      amount:       amountRaw,
      currency:     'CZK',
      category:     category,
      needs_review: 'FALSE',
    };

    // Write note/merchant into whichever extra column the sheet uses for it
    if (note) {
      for (const h of data.txHeaders) {
        if (['merchant','comment','note','description','notes','user_comments','user_comment','user comments'].includes(h.toLowerCase())) {
          fields[h] = note;
          break;
        }
      }
    }

    try {
      await appendTransaction(data.txHeaders, fields);
      btn.textContent = '✓ Added!';
      setTimeout(() => {
        clearCache();
        navigate('transactions');
      }, 700);
    } catch (err) {
      showErr(errEl, err.message);
      btn.textContent = 'Add Transaction';
      btn.disabled    = false;
    }
  });
}

function showErr(el, msg) {
  el.textContent    = msg;
  el.style.display  = 'block';
}
