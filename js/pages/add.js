import { loadData, appendTransaction, clearCache } from '../api.js';
import { navigate } from '../router.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function monthOf(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function billingPeriodOf(dateStr, salaryPeriods) {
  if (!salaryPeriods?.length) return monthOf(dateStr);
  const sorted = [...salaryPeriods]
    .filter(p => p.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  let result = sorted[0]?.period || monthOf(dateStr);
  for (const sp of sorted) {
    if (sp.start_date <= dateStr) result = sp.period;
    else break;
  }
  return result;
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

    const month   = monthOf(dateVal);
    const period  = billingPeriodOf(dateVal, data.salaryPeriods);
    const dateTime = `${dateVal} 00:00:00`;

    // Build fields map — covers known schema + note
    const fields = {
      email_id:       'manual',
      date:           dateTime,
      bank:           bank,
      direction:      currentType,
      amount:         amountRaw,
      currency:       'CZK',
      category:       category,
      month:          month,
      billing_period: period,
      needs_review:   'FALSE',
      report_amount:  amountRaw,
    };

    // If there are extra columns (e.g. merchant, comment), write note there
    if (note) {
      for (const h of data.txHeaders) {
        if (['merchant','comment','note','description','notes'].includes(h.toLowerCase())) {
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
