import { loadData } from '../api.js';
import { navigate } from '../router.js';

const CAT_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
];

function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function fmt(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.abs(n)) + ' Kč';
}

function fmtPeriod(period) {
  if (!period) return period;
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-');
    return new Date(+y, +m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }
  return period;
}

function getMerchant(t) {
  return t.merchant || t.description || t.note || t.Merchant || '';
}

export function renderMerchants(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  const { period, mode = 'billing' } = params;

  loadData().then(data => {
    const key  = mode === 'billing' ? 'billing_period' : 'month';
    const txns = data.transactions.filter(t => t[key] === period && t.direction === 'expense');

    const byMerchant = {};
    for (const t of txns) {
      const m = getMerchant(t);
      if (!m) continue;
      byMerchant[m] = (byMerchant[m] || 0) + parseAmount(t.report_amount);
    }

    const merchants = Object.entries(byMerchant).sort(([, a], [, b]) => b - a);
    const total     = merchants.reduce((sum, [, v]) => sum + v, 0);

    renderPage(el, merchants, total, period, mode);
  }).catch(err => {
    el.innerHTML = `<div class="mp-page"><div class="error-msg">${err.message}</div></div>`;
  });
}

function renderPage(el, merchants, total, period, mode) {
  const periodLabel = fmtPeriod(period);

  el.innerHTML = `
    <div class="mp-page">

      <button class="bp-back" id="mp-back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Overview
      </button>

      <div class="bp-header">
        <div class="bp-title">${periodLabel} Merchants</div>
        <div class="bp-total-row">
          <div>
            <div class="bp-total-label">TOTAL SPENT</div>
            <div class="bp-total">${fmt(total)}</div>
          </div>
          <div class="bp-cat-count">${merchants.length} merchant${merchants.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div class="bp-list">
        ${merchants.length ? merchants.map(([name, amt], i) => {
          const pct   = total > 0 ? (amt / total) * 100 : 0;
          const color = CAT_COLORS[i % CAT_COLORS.length];
          return `
          <div class="bp-cat-row mp-merchant-row" data-merchant="${name.replace(/"/g, '&quot;')}">
            <div class="bp-cat-dot" style="background:${color}"></div>
            <div class="bp-cat-body">
              <div class="bp-cat-main">
                <span class="bp-cat-name">${name}</span>
                <span class="bp-cat-amount">${fmt(amt)}</span>
              </div>
              <div class="bp-cat-sub">
                <div class="bp-cat-bar">
                  <div class="bp-cat-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
                </div>
                <span class="bp-cat-pct">${Math.round(pct)}%</span>
              </div>
            </div>
            <svg class="bp-row-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
        }).join('') : '<div class="txn-empty">No merchant data for this period.<br><span style="font-size:0.8rem;opacity:0.6">Add a Merchant column to your sheet.</span></div>'}
      </div>

    </div>
  `;

  el.querySelector('#mp-back').addEventListener('click', () => navigate('dashboard'));

  el.querySelectorAll('.mp-merchant-row').forEach(row => {
    row.addEventListener('click', () => {
      navigate('transactions', { merchant: row.dataset.merchant, period });
    });
  });
}
