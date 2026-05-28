import { loadData, clearCache } from '../api.js';
import { navigate } from '../router.js';
import { getCategoryEmoji, getCategoryColor } from '../categoryIcons.js';

let donutChart = null;
let trendChart = null;
let weekChart  = null;
let dowChart   = null;

// Category colour palette — shared with breakdown.js
const CAT_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
];

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  mode:        'billing',  // 'billing' | 'calendar'
  periodIndex: 0,
  periods:     [],
  data:        null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.abs(n)) + ' Kč';
}

// Sheets returns numbers as formatted strings, e.g. "78,000" — strip thousands separators
function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function getAvailablePeriods(data, mode) {
  if (mode === 'billing') {
    return [...new Set(data.salaryPeriods.map(p => p.period).filter(Boolean))].sort().reverse();
  }
  return [...new Set(data.transactions.map(t => t.month).filter(Boolean))].sort().reverse();
}

function getCurrentPeriodIndex(periods, transactions, mode) {
  // Find the most recent period in the list that has actual transaction data
  const key = mode === 'billing' ? 'billing_period' : 'month';
  const periodsWithData = new Set(transactions.map(t => t[key]).filter(Boolean));
  const idx = periods.findIndex(p => periodsWithData.has(p)); // periods is already sorted desc
  if (idx >= 0) return idx;
  return 0; // fall back to most recent period
}

function filterTxns(data, period, mode) {
  const key = mode === 'billing' ? 'billing_period' : 'month';
  return data.transactions.filter(t => t[key] === period);
}

function computeSummary(txns) {
  let income = 0, expenses = 0, needsReview = 0;
  for (const t of txns) {
    const amt = parseAmount(t.report_amount);
    if (t.direction === 'income')  income   += amt;
    if (t.direction === 'expense') expenses += amt;
    if (t.needs_review === 'TRUE' || t.needs_review === true) needsReview++;
  }
  return { income, expenses, balance: income - expenses, needsReview };
}

function computeSavingsRate(summary) {
  if (!summary.income) return null;
  return ((summary.income - summary.expenses) / summary.income) * 100;
}

function computeBudgetProgress(txns, budgets) {
  const expenses = txns.filter(t => t.direction === 'expense');
  const actualByCategory = {};
  for (const t of expenses) {
    const cat = t.category || 'Uncategorized';
    actualByCategory[cat] = (actualByCategory[cat] || 0) + parseAmount(t.report_amount);
  }

  // Budgeted categories
  const result = budgets
    .filter(b => b.Category)
    .map(b => ({
      category: b.Category,
      budget:   parseAmount(b['Monthly Budget']),
      actual:   actualByCategory[b.Category] || 0,
    }))
    .filter(b => b.budget > 0 || b.actual > 0)
    .sort((a, b) => (b.actual / (b.budget || Infinity)) - (a.actual / (a.budget || Infinity)));

  // Unbudgeted categories with spending
  const budgeted = new Set(result.map(r => r.category));
  for (const [cat, actual] of Object.entries(actualByCategory)) {
    if (!budgeted.has(cat) && actual > 0) result.push({ category: cat, budget: 0, actual });
  }

  return result;
}

function progressClass(actual, budget) {
  if (!budget) return 'over';
  const ratio = actual / budget;
  if (ratio >= 1)   return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

// Returns % of billing period elapsed (0–100), or null if not computable
function computePeriodElapsed(salaryPeriods, currentPeriod) {
  const sorted = [...salaryPeriods]
    .filter(p => p.start_date && p.period)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const idx = sorted.findIndex(p => p.period === currentPeriod);
  if (idx < 0) return null;
  const start = new Date(sorted[idx].start_date);
  // End = next period's start_date, or start + 30 days if this is the last
  const end = idx < sorted.length - 1
    ? new Date(sorted[idx + 1].start_date)
    : new Date(start.getTime() + 30 * 86400000);
  const now = new Date();
  if (now < start) return 0;
  if (now >= end)  return 100;
  return ((now - start) / (end - start)) * 100;
}

// Last N calendar months of expense spending across ALL transactions
function computeSpendingTrend(transactions, n = 6) {
  const byMonth = {};
  for (const t of transactions) {
    if (t.direction !== 'expense') continue;
    const m = t.month || (t.date ? t.date.slice(0, 7) : null);
    if (!m) continue;
    byMonth[m] = (byMonth[m] || 0) + parseAmount(t.report_amount);
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-n);
}

// Current period vs previous period, per category (expenses only)
function computePeriodComparison(data, currentPeriod, mode) {
  const periods = getAvailablePeriods(data, mode);
  const ci = periods.indexOf(currentPeriod);
  if (ci < 0 || ci >= periods.length - 1) return null;
  const prevPeriod = periods[ci + 1];

  const toMap = txns => {
    const m = {};
    for (const t of txns.filter(t => t.direction === 'expense')) {
      const cat = t.category || 'Uncategorized';
      m[cat] = (m[cat] || 0) + parseAmount(t.report_amount);
    }
    return m;
  };
  const curr = toMap(filterTxns(data, currentPeriod, mode));
  const prev = toMap(filterTxns(data, prevPeriod, mode));

  const cats = new Set([...Object.keys(curr), ...Object.keys(prev)]);
  return {
    prevPeriod,
    rows: [...cats].map(cat => ({
      category: cat,
      current:  curr[cat] || 0,
      prev:     prev[cat] || 0,
      pct:      prev[cat] ? ((curr[cat] || 0) - prev[cat]) / prev[cat] * 100 : null,
    })).sort((a, b) => b.current - a.current),
  };
}

// Spending per calendar-week within the current period's transactions
function computeWeeklySpending(txns) {
  const byWeek = {};
  for (const t of txns) {
    if (t.direction !== 'expense' || !t.date) continue;
    const day  = new Date(t.date.slice(0, 10)).getDate();
    const week = Math.ceil(day / 7);
    const key  = `Wk ${week}`;
    byWeek[key] = (byWeek[key] || 0) + parseAmount(t.report_amount);
  }
  return Object.entries(byWeek).sort(([a], [b]) =>
    parseInt(a.slice(3)) - parseInt(b.slice(3)));
}

// Total spending per day-of-week (Mon–Sun) within the current period
function computeDowSpending(txns) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totals = Array(7).fill(0);
  for (const t of txns) {
    if (t.direction !== 'expense' || !t.date) continue;
    const dow = (new Date(t.date.slice(0, 10)).getDay() + 6) % 7; // Mon = 0
    totals[dow] += parseAmount(t.report_amount);
  }
  return labels.map((l, i) => [l, totals[i]]);
}

// Categories that appear in ≥ minPeriods distinct billing/calendar periods
function detectRecurring(transactions, mode, minPeriods = 2) {
  const byCat = {};
  for (const t of transactions) {
    if (t.direction !== 'expense') continue;
    const cat    = t.category || 'Uncategorized';
    const period = mode === 'billing' ? t.billing_period : t.month;
    if (!period) continue;
    if (!byCat[cat]) byCat[cat] = { periods: new Set(), amounts: [] };
    byCat[cat].periods.add(period);
    byCat[cat].amounts.push(parseAmount(t.report_amount));
  }
  return Object.entries(byCat)
    .filter(([, v]) => v.periods.size >= minPeriods)
    .map(([category, v]) => ({
      category,
      periodCount: v.periods.size,
      avgAmount:   v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length,
    }))
    .sort((a, b) => b.avgAmount - a.avgAmount)
    .slice(0, 8);
}

// Shared Chart.js options for the mini bar charts
function miniBarOptions(labelCb) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => ` ${labelCb ? labelCb(ctx) : fmt(ctx.raw)}` },
      },
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, maxTicksLimit: 4,
           callback: v => v >= 1000 ? `${Math.round(v/1000)}k` : v } },
    },
  };
}

// Format "2026-05" → "May 2026"
function fmtPeriod(period) {
  if (!period) return period;
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-');
    return new Date(+y, +m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }
  return period;
}

// Format "2026-04" → "Apr '26"
function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  const name = new Date(+y, +m - 1, 1).toLocaleString('en-GB', { month: 'short' });
  return `${name} '${y.slice(2)}`;
}

// ── Render ───────────────────────────────────────────────────────────────────

export function renderDashboard(el) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  loadData()
    .then(data => {
      // Always rebuild periods from fresh data so stale periods never linger
      const freshPeriods = getAvailablePeriods(data, state.mode);
      if (!state.periods.length || state.data !== data) {
        state.periods     = freshPeriods;
        state.periodIndex = getCurrentPeriodIndex(freshPeriods, data.transactions, state.mode);
      }
      state.data = data;
      renderPage(el);
    })
    .catch(err => {
      el.innerHTML = `<div class="dashboard"><div class="error-msg">${err.message}</div></div>`;
    });
}

function renderPage(el) {
  // Destroy all existing charts so canvas elements can be re-used
  [donutChart, trendChart, weekChart, dowChart].forEach(c => { if (c) c.destroy(); });
  donutChart = trendChart = weekChart = dowChart = null;

  const { data, mode, periodIndex, periods } = state;
  if (!periods.length) {
    el.innerHTML = '<div class="dashboard"><div class="error-msg">No data found.</div></div>';
    return;
  }

  const period      = periods[periodIndex];
  const txns        = filterTxns(data, period, mode);
  const summary     = computeSummary(txns);
  const savingsRate = computeSavingsRate(summary);
  const budget      = computeBudgetProgress(txns, data.budgets);
  const hasSpend    = budget.some(b => b.actual > 0);

  // Budget pacing — only meaningful in billing mode
  const elapsedPct  = mode === 'billing'
    ? computePeriodElapsed(data.salaryPeriods, period)
    : null;

  const trend       = computeSpendingTrend(data.transactions);
  const comparison  = computePeriodComparison(data, period, mode);
  const weekly      = computeWeeklySpending(txns);
  const dow         = computeDowSpending(txns);
  const recurring   = detectRecurring(data.transactions, mode);

  // "Spent in [Period]" card — always uses billing period regardless of mode
  const billingPeriods  = getAvailablePeriods(data, 'billing');
  const billingPIdx     = getCurrentPeriodIndex(billingPeriods, data.transactions, 'billing');
  const billingPeriod   = billingPeriods[billingPIdx] ?? period;
  const billingTxns     = filterTxns(data, billingPeriod, 'billing');
  const billingByCat    = {};
  for (const t of billingTxns.filter(t => t.direction === 'expense')) {
    const cat = t.category || 'Uncategorized';
    billingByCat[cat] = (billingByCat[cat] || 0) + parseAmount(t.report_amount);
  }
  const billingCats  = Object.entries(billingByCat).sort(([, a], [, b]) => b - a);
  const billingTotal = billingCats.reduce((s, [, v]) => s + v, 0);

  // Merchant card — top merchants for the current billing period
  const getMerchant = t => t.merchant || t.description || t.note || t.Merchant || '';
  const billingByMerchant = {};
  for (const t of billingTxns.filter(t => t.direction === 'expense')) {
    const m = getMerchant(t);
    if (!m) continue;
    billingByMerchant[m] = (billingByMerchant[m] || 0) + parseAmount(t.report_amount);
  }
  const billingMerchants = Object.entries(billingByMerchant).sort(([, a], [, b]) => b - a);

  const merchantCardHtml = billingMerchants.length > 0 ? (() => {
    const rows = billingMerchants.slice(0, 4).map(([name, amt]) =>
      '<div class="mc-row">'
      + '<span class="mc-name">' + name + '</span>'
      + '<span class="mc-amount">' + fmt(amt) + '</span>'
      + '</div>'
    ).join('');
    const remaining = billingMerchants.length - 4;
    const footer = remaining > 0
      ? '<span class="spent-card-hint">+' + remaining + ' more</span>'
      : '<span class="spent-card-hint">' + billingMerchants.length + ' merchant' + (billingMerchants.length === 1 ? '' : 's') + '</span>';
    return '<div class="merchant-card" id="merchant-card">'
      + '<div class="spent-card-label">BY MERCHANT · ' + fmtPeriod(billingPeriod).toUpperCase() + '</div>'
      + '<div class="mc-list">' + rows + '</div>'
      + '<div class="spent-card-footer">' + footer
      + '<span class="spent-card-arrow">See all →</span>'
      + '</div>'
      + '</div>';
  })() : '';

  // Pre-build spent card HTML (avoids deep template literal nesting)
  const spentCardHtml = billingTotal > 0 ? (() => {
    const segBar = billingCats.slice(0, 9).map(([, amt], i) => {
      const pct = (amt / billingTotal) * 100;
      return '<div class="seg-segment" style="width:' + pct.toFixed(1) + '%;background:' + CAT_COLORS[i] + '"></div>';
    }).join('');
    const catWord = billingCats.length === 1 ? 'category' : 'categories';
    return '<div class="spent-card" id="spent-card">'
      + '<div class="spent-card-label">SPENT IN ' + fmtPeriod(billingPeriod).toUpperCase() + '</div>'
      + '<div class="spent-card-amount">' + fmt(billingTotal) + '</div>'
      + '<div class="spent-card-seg-bar">' + segBar + '</div>'
      + '<div class="spent-card-footer">'
      + '<span class="spent-card-hint">' + billingCats.length + ' ' + catWord + '</span>'
      + '<span class="spent-card-arrow">See breakdown →</span>'
      + '</div>'
      + '</div>';
  })() : '';

  el.innerHTML = `
    <div class="dashboard">

      <!-- Period controls -->
      <div class="period-bar">
        <div class="period-toggle">
          <button data-mode="billing"  class="${mode === 'billing'  ? 'active' : ''}">Billing Period</button>
          <button data-mode="calendar" class="${mode === 'calendar' ? 'active' : ''}">Calendar Month</button>
        </div>
        <div class="period-nav">
          <button class="period-nav-btn" data-dir="prev" ${periodIndex >= periods.length - 1 ? 'disabled' : ''}>‹</button>
          <span class="period-label">${period}</span>
          <button class="period-nav-btn" data-dir="next" ${periodIndex <= 0 ? 'disabled' : ''}>›</button>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="summary-grid">
        <div class="summary-card card-income">
          <div class="card-label">Income</div>
          <div class="card-value">${fmt(summary.income)}</div>
        </div>
        <div class="summary-card card-expense">
          <div class="card-label">Expenses</div>
          <div class="card-value">${fmt(summary.expenses)}</div>
        </div>
        <div class="summary-card card-balance">
          <div class="card-label">Balance</div>
          <div class="card-value ${summary.balance >= 0 ? 'positive' : 'negative'}">
            ${summary.balance >= 0 ? '' : '−'} ${fmt(summary.balance)}
          </div>
        </div>
        <div class="summary-card card-savings">
          <div class="card-label">Savings Rate</div>
          <div class="card-value ${savingsRate === null ? '' : savingsRate >= 0 ? 'positive' : 'negative'}">
            ${savingsRate === null ? '—' : `${savingsRate >= 0 ? '' : '−'}${Math.abs(savingsRate).toFixed(1)}%`}
          </div>
        </div>
      </div>

      <!-- Spent in billing period card -->
      ${spentCardHtml}

      <!-- By Merchant card -->
      ${merchantCardHtml}

      <!-- Needs-review banner -->
      ${summary.needsReview > 0 ? `
      <div class="review-banner">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" flex-shrink="0">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>
        </svg>
        <span>${summary.needsReview} transaction${summary.needsReview > 1 ? 's' : ''} need${summary.needsReview === 1 ? 's' : ''} review</span>
      </div>` : ''}

      <!-- Budget progress -->
      <div class="budget-section-header">
        <div class="section-title" style="margin-top:0">Budget vs Actual</div>
        ${elapsedPct !== null ? `
        <div class="period-progress-row">
          <div class="period-progress-bar">
            <div class="period-progress-fill" style="width:${Math.min(100, elapsedPct)}%"></div>
          </div>
          <span class="period-progress-label">${Math.round(elapsedPct)}% elapsed</span>
        </div>` : ''}
      </div>

      <div class="budget-grid">
        ${budget.length ? budget.map((b, i) => {
          const pct = b.budget > 0 ? Math.min(100, (b.actual / b.budget) * 100) : 100;
          const cls = progressClass(b.actual, b.budget);
          const color = CAT_COLORS[i % CAT_COLORS.length];
          const emoji = getCategoryEmoji(b.category);
          const iconColor = getCategoryColor(b.category);
          return '<div class="budget-card" data-category="' + b.category + '" data-period="' + period + '" data-mode="' + mode + '">'
            + '<div class="budget-card-top">'
            + '<span class="budget-card-icon" style="background:' + iconColor + '22;border:1px solid ' + iconColor + '44">' + emoji + '</span>'
            + '</div>'
            + '<div class="budget-card-label">' + b.category + '</div>'
            + '<div class="budget-card-amount">' + fmt(b.actual) + '</div>'
            + (b.budget > 0
                ? '<div class="budget-card-limit">of ' + fmt(b.budget) + '</div>'
                : '<div class="budget-card-limit no-budget">no budget set</div>')
            + '<div class="budget-card-track">'
            + '<div class="budget-card-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%;background:' + (cls === 'ok' ? 'var(--green)' : cls === 'warn' ? 'var(--yellow)' : 'var(--red)') + '"></div>'
            + '</div>'
            + '</div>';
        }).join('') : '<div class="budget-empty">No expenses this period</div>'}
      </div>

      <!-- Spending breakdown donut -->
      ${hasSpend ? `
      <div class="section-title">Spending Breakdown <span class="section-hint">tap a slice to see records</span></div>
      <div class="chart-wrap">
        <div class="chart-container">
          <canvas id="donut-chart"></canvas>
        </div>
      </div>` : ''}

      <!-- Spending Trend -->
      ${trend.length >= 2 ? `
      <div class="section-title">Spending Trend <span class="section-hint">last ${trend.length} months</span></div>
      <div class="chart-wrap">
        <div class="chart-container trend-wrap">
          <canvas id="trend-chart"></canvas>
        </div>
      </div>` : ''}

      <!-- Period Comparison -->
      ${comparison ? `
      <div class="section-title">vs Previous Period <span class="section-hint">${comparison.prevPeriod}</span></div>
      <div class="budget-list">
        ${comparison.rows.map(r => {
          const arrow = r.pct === null ? '' : r.pct > 0 ? '↑' : r.pct < 0 ? '↓' : '=';
          const badgeCls = r.pct === null ? 'new' : r.pct > 0 ? 'up' : r.pct < 0 ? 'down' : 'neutral';
          const pctLabel = r.pct === null
            ? 'new'
            : r.pct === 0
              ? '= same'
              : `${arrow} ${Math.abs(r.pct).toFixed(0)}%`;
          return `
          <div class="comparison-row">
            <div class="comparison-left">
              <span class="budget-category">${r.category}</span>
              <span class="comparison-amounts">${fmt(r.current)}${r.prev ? ` · was ${fmt(r.prev)}` : ''}</span>
            </div>
            <span class="comparison-badge ${badgeCls}">${pctLabel}</span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Weekly & Day-of-Week Breakdown -->
      ${(weekly.length > 0 || dow.some(([, v]) => v > 0)) ? `
      <details class="breakdown-details">
        <summary class="breakdown-summary">
          <span class="section-title" style="margin-top:0">Weekly &amp; Day Breakdown</span>
          <svg class="breakdown-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </summary>
        <div class="breakdown-stack">
          <div class="breakdown-block">
            <div class="breakdown-label">By Week <span class="section-hint">tap a bar to filter Records</span></div>
            <div class="breakdown-chart-wrap"><canvas id="week-chart"></canvas></div>
          </div>
          <div class="breakdown-block">
            <div class="breakdown-label">By Day of Week</div>
            <div class="breakdown-chart-wrap"><canvas id="dow-chart"></canvas></div>
          </div>
        </div>
      </details>` : ''}

      <!-- Recurring Expenses -->
      ${recurring.length > 0 ? `
      <div class="section-title">Recurring Expenses <span class="section-hint">≥2 periods</span></div>
      <div class="budget-list">
        ${recurring.map(r => `
        <div class="recurring-item">
          <div class="recurring-left">
            <span class="budget-category">${r.category}</span>
            <span class="recurring-avg">avg ${fmt(r.avgAmount)}</span>
          </div>
          <span class="recurring-badge">× ${r.periodCount}</span>
        </div>`).join('')}
      </div>` : ''}

      <!-- Refresh -->
      <button class="btn-refresh" id="refresh-btn">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Refresh data
      </button>

    </div>
  `;

  // ── Event listeners ───────────────────────────────────────────────────────

  // Period toggle
  el.querySelectorAll('.period-toggle button').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode        = btn.dataset.mode;
      state.periods     = getAvailablePeriods(state.data, state.mode);
      state.periodIndex = getCurrentPeriodIndex(state.periods, state.data.transactions, state.mode);
      renderPage(el);
    })
  );

  // Period nav
  el.querySelectorAll('.period-nav-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.dir === 'prev') state.periodIndex = Math.min(state.periods.length - 1, state.periodIndex + 1);
      if (btn.dataset.dir === 'next') state.periodIndex = Math.max(0, state.periodIndex - 1);
      renderPage(el);
    })
  );

  // Refresh
  el.querySelector('#refresh-btn')?.addEventListener('click', () => {
    clearCache();
    state.periods = [];
    renderDashboard(el);
  });

  // Spent card → breakdown page
  el.querySelector('#spent-card')?.addEventListener('click', () => {
    navigate('breakdown', { period: billingPeriod, mode: 'billing' });
  });

  // Merchant card → merchants page
  el.querySelector('#merchant-card')?.addEventListener('click', () => {
    navigate('merchants', { period: billingPeriod, mode: 'billing' });
  });

  // Budget cards → transactions filtered by category + period
  el.querySelectorAll('.budget-card').forEach(card => {
    card.addEventListener('click', () => {
      navigate('transactions', {
        category: card.dataset.category,
        period:   card.dataset.period,
      });
    });
  });

  // ── Charts ────────────────────────────────────────────────────────────────

  // Donut chart
  if (hasSpend) {
    const canvas = document.getElementById('donut-chart');
    if (canvas) {
      const top = budget.filter(b => b.actual > 0).slice(0, 9);
      donutChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: top.map(b => b.category),
          datasets: [{
            data: top.map(b => b.actual),
            backgroundColor: [
              '#6366f1','#10b981','#f59e0b','#f43f5e',
              '#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899',
            ],
            borderWidth: 0,
            hoverOffset: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 10 },
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}`,
              },
            },
          },
          onClick: (evt, elements) => {
            if (!elements.length) return;
            const idx      = elements[0].index;
            const category = top[idx]?.category;
            if (category) navigate('transactions', { category, period: periods[periodIndex] });
          },
        },
      });
      canvas.style.cursor = 'pointer';
    }
  }

  // Spending Trend chart
  if (trend.length >= 2) {
    const canvas = document.getElementById('trend-chart');
    if (canvas) {
      trendChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: trend.map(([m]) => fmtMonth(m)),
          datasets: [{
            data: trend.map(([, v]) => v),
            backgroundColor: '#6366f1',
            borderRadius: 6,
            hoverBackgroundColor: '#818cf8',
          }],
        },
        options: {
          ...miniBarOptions(),
          responsive: true,
          maintainAspectRatio: false,
        },
      });
    }
  }

  // Weekly & Day-of-Week charts — lazy-rendered when details opens
  const breakdownEl = el.querySelector('.breakdown-details');
  if (breakdownEl) {
    const makeBreakdownCharts = () => {
      const weekCanvas = document.getElementById('week-chart');
      if (weekCanvas && !weekChart && weekly.length) {
        weekChart = new Chart(weekCanvas, {
          type: 'bar',
          data: {
            labels: weekly.map(([l]) => l),
            datasets: [{
              data: weekly.map(([, v]) => v),
              backgroundColor: '#10b981',
              borderRadius: 5,
              hoverBackgroundColor: '#34d399',
            }],
          },
          options: {
            ...miniBarOptions(),
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
              if (!elements.length) return;
              const label   = weekly[elements[0].index][0]; // e.g. 'Wk 3'
              const weekNum = parseInt(label.replace('Wk ', ''));
              navigate('transactions', { period, weekNum });
            },
          },
        });
        weekCanvas.style.cursor = 'pointer';
      }

      const dowCanvas = document.getElementById('dow-chart');
      if (dowCanvas && !dowChart) {
        dowChart = new Chart(dowCanvas, {
          type: 'bar',
          data: {
            labels: dow.map(([l]) => l),
            datasets: [{
              data: dow.map(([, v]) => v),
              backgroundColor: '#f59e0b',
              borderRadius: 5,
              hoverBackgroundColor: '#fbbf24',
            }],
          },
          options: { ...miniBarOptions(), responsive: true, maintainAspectRatio: false },
        });
      }
    };

    // If details is already open (persists across renders), draw immediately
    if (breakdownEl.open) makeBreakdownCharts();

    breakdownEl.addEventListener('toggle', () => {
      if (breakdownEl.open) {
        makeBreakdownCharts();
      } else {
        if (weekChart) { weekChart.destroy(); weekChart = null; }
        if (dowChart)  { dowChart.destroy();  dowChart  = null; }
      }
    });
  }
}
