import { loadData, clearCache } from '../api.js';
import { navigate } from '../router.js';

let donutChart = null;

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

function getCurrentPeriodIndex(periods) {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const idx = periods.indexOf(cur);
  return idx >= 0 ? idx : 0;
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

// ── Render ───────────────────────────────────────────────────────────────────

export function renderDashboard(el) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  loadData()
    .then(data => {
      // Always rebuild periods from fresh data so stale periods never linger
      const freshPeriods = getAvailablePeriods(data, state.mode);
      if (!state.periods.length || state.data !== data) {
        state.periods     = freshPeriods;
        state.periodIndex = getCurrentPeriodIndex(freshPeriods);
      }
      state.data = data;
      renderPage(el);
    })
    .catch(err => {
      el.innerHTML = `<div class="dashboard"><div class="error-msg">${err.message}</div></div>`;
    });
}

function renderPage(el) {
  const { data, mode, periodIndex, periods } = state;
  if (!periods.length) {
    el.innerHTML = '<div class="dashboard"><div class="error-msg">No data found.</div></div>';
    return;
  }

  const period   = periods[periodIndex];
  const txns     = filterTxns(data, period, mode);
  const summary  = computeSummary(txns);
  const budget   = computeBudgetProgress(txns, data.budgets);
  const hasSpend = budget.some(b => b.actual > 0);

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
        <div class="summary-card card-balance wide">
          <div class="card-label">Balance</div>
          <div class="card-value ${summary.balance >= 0 ? 'positive' : 'negative'}">
            ${summary.balance >= 0 ? '' : '−'} ${fmt(summary.balance)}
          </div>
        </div>
      </div>

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
      <div class="section-title">Budget vs Actual</div>
      <div class="budget-list">
        ${budget.length ? budget.map(b => {
          const pct = b.budget > 0 ? Math.min(100, (b.actual / b.budget) * 100) : 100;
          const cls = progressClass(b.actual, b.budget);
          return `
          <div class="budget-item">
            <div class="budget-row">
              <span class="budget-category">${b.category}</span>
              <span class="budget-amounts">
                <strong>${fmt(b.actual)}</strong>${b.budget ? ` / ${fmt(b.budget)}` : ''}
              </span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${cls}" style="width:${pct}%"></div>
            </div>
          </div>`;
        }).join('') : '<div class="budget-item muted-row">No expenses this period</div>'}
      </div>

      <!-- Spending breakdown donut -->
      ${hasSpend ? `
      <div class="section-title">Spending Breakdown <span class="section-hint">tap a slice to see records</span></div>
      <div class="chart-wrap">
        <div class="chart-container">
          <canvas id="donut-chart"></canvas>
        </div>
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

  // Period toggle
  el.querySelectorAll('.period-toggle button').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode        = btn.dataset.mode;
      state.periods     = getAvailablePeriods(state.data, state.mode);
      state.periodIndex = getCurrentPeriodIndex(state.periods);
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

  // Donut chart
  if (hasSpend) {
    const canvas = document.getElementById('donut-chart');
    if (canvas) {
      if (donutChart) { donutChart.destroy(); donutChart = null; }
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
}
