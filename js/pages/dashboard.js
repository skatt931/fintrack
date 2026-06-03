import { loadData, clearCache, updateBudgetAmount, appendBudgetRow } from '../api.js';
import { navigate }                           from '../router.js';
import { getCategoryEmoji, getCategoryColor } from '../categoryIcons.js';
import { loadSections }                       from '../settings.js';

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

// Days from today until the next salary period start date (next payday)
function computeDaysUntilPayday(salaryPeriods) {
  const today = new Date().toISOString().slice(0, 10);
  const next  = [...salaryPeriods]
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (!next) return null;
  return Math.ceil(
    (new Date(next.start_date + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000
  );
}

// Returns the next salary period start_date string after today, or null
function computeNextPayday(salaryPeriods) {
  const today = new Date().toISOString().slice(0, 10);
  return [...salaryPeriods]
    .filter(p => p.start_date && p.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]?.start_date || null;
}

// Returns planned items that count toward the upcoming total:
//   one-time: status=planned, due_date <= nextPayday
//   recurring: not paid in current billing period, due_date <= nextPayday
function getUpcomingPlanned(planned, salaryPeriods) {
  const today       = new Date().toISOString().slice(0, 10);
  const nextPay     = computeNextPayday(salaryPeriods) || '9999-99-99';
  // billing period start = most recent start_date <= today
  const periodStart = [...salaryPeriods]
    .filter(p => p.start_date && p.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]?.start_date || today;

  return (planned || []).filter(p => {
    if (!(p.name || '').trim()) return false;      // skip empty/artefact rows
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

// Open reimbursements — transactions the user is owed money on
function getOpenReimbursements(transactions) {
  return transactions
    .filter(t =>
      t.link_role === 'original_expense' &&
      t.reimbursement_status !== 'Settled' &&
      parseAmount(t.expected_reimbursement) > 0
    )
    .map(t => ({
      name:        t.merchant || t.description || t.user_comment || '(unknown)',
      outstanding: Math.max(
        0,
        parseAmount(t.expected_reimbursement) - parseAmount(t.linked_reimbursement_total)
      ),
      status: t.reimbursement_status || 'Waiting',
    }))
    .filter(r => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
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
      _row:     b._row,
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

// Render only the visible sections in the user-defined order
function buildSections(htmlMap, sections) {
  return sections
    .filter(s => s.visible)
    .map(s => htmlMap[s.id] || '')
    .join('');
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

// Normalise any date string to YYYY-MM-DD (handles DD/MM/YYYY and ISO variants)
function normDateKey(str) {
  if (!str) return '';
  const s = str.trim();
  const eu = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return s.slice(0, 10);
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

  const period            = periods[periodIndex];
  const txns              = filterTxns(data, period, mode);
  const summary           = computeSummary(txns);
  const daysUntilPayday   = computeDaysUntilPayday(data.salaryPeriods);
  const safeLimit         = (daysUntilPayday > 0 && summary.balance > 0)
    ? summary.balance / daysUntilPayday
    : null;
  const budget            = computeBudgetProgress(txns, data.budgets);
  const openReimbursements = getOpenReimbursements(data.transactions);

  // Planned expenses — upcoming before next payday
  const upcomingPlanned      = getUpcomingPlanned(data.planned || [], data.salaryPeriods);
  const upcomingPlannedTotal = upcomingPlanned.reduce((s, p) => s + parseAmount(p.amount), 0);
  const projectedBalance     = summary.balance - upcomingPlannedTotal;

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

  // "Spent in [Period]" and "By Merchant" cards — follow the currently selected period + mode
  const getMerchant   = t => t.merchant || t.description || t.note || t.Merchant || '';
  const spentByCat    = {};
  const spentByMerchant = {};
  for (const t of txns.filter(t => t.direction === 'expense')) {
    const cat = t.category || 'Uncategorized';
    spentByCat[cat] = (spentByCat[cat] || 0) + parseAmount(t.report_amount);
    const m = getMerchant(t);
    if (m) spentByMerchant[m] = (spentByMerchant[m] || 0) + parseAmount(t.report_amount);
  }
  const spentCats      = Object.entries(spentByCat).sort(([, a], [, b]) => b - a);
  const spentTotal     = spentCats.reduce((s, [, v]) => s + v, 0);
  const spentMerchants = Object.entries(spentByMerchant).sort(([, a], [, b]) => b - a);

  const merchantCardHtml = spentMerchants.length > 0 ? (() => {
    const rows = spentMerchants.slice(0, 4).map(([name, amt]) =>
      '<div class="mc-row">'
      + '<span class="mc-name">' + name + '</span>'
      + '<span class="mc-amount">' + fmt(amt) + '</span>'
      + '</div>'
    ).join('');
    const remaining = spentMerchants.length - 4;
    const footer = remaining > 0
      ? '<span class="spent-card-hint">+' + remaining + ' more</span>'
      : '<span class="spent-card-hint">' + spentMerchants.length + ' merchant' + (spentMerchants.length === 1 ? '' : 's') + '</span>';
    return '<div class="merchant-card" id="merchant-card">'
      + '<div class="spent-card-label">BY MERCHANT · ' + fmtPeriod(period).toUpperCase() + '</div>'
      + '<div class="mc-list">' + rows + '</div>'
      + '<div class="spent-card-footer">' + footer
      + '<span class="spent-card-arrow">See all →</span>'
      + '</div>'
      + '</div>';
  })() : '';

  // Pre-build spent card HTML (avoids deep template literal nesting)
  const spentCardHtmlInner = spentTotal > 0 ? (() => {
    const segBar = spentCats.slice(0, 9).map(([, amt], i) => {
      const pct = (amt / spentTotal) * 100;
      return '<div class="seg-segment" style="width:' + pct.toFixed(1) + '%;background:' + CAT_COLORS[i] + '"></div>';
    }).join('');
    const catWord = spentCats.length === 1 ? 'category' : 'categories';
    return '<div class="spent-card" id="spent-card">'
      + '<div class="spent-card-label">SPENT IN ' + fmtPeriod(period).toUpperCase() + '</div>'
      + '<div class="spent-card-amount">' + fmt(spentTotal) + '</div>'
      + '<div class="spent-card-seg-bar">' + segBar + '</div>'
      + '<div class="spent-card-footer">'
      + '<span class="spent-card-hint">' + spentCats.length + ' ' + catWord + '</span>'
      + '<span class="spent-card-arrow">See breakdown →</span>'
      + '</div>'
      + '</div>';
  })() : '';

  // ── Pre-build all configurable section HTML ───────────────────────────────

  const budgetSectionHtml = `
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
        const pct      = b.budget > 0 ? Math.min(100, (b.actual / b.budget) * 100) : 100;
        const cls      = progressClass(b.actual, b.budget);
        const iconColor = getCategoryColor(b.category);
        const emoji    = getCategoryEmoji(b.category);
        return '<div class="budget-card" data-category="' + b.category + '" data-period="' + period + '" data-mode="' + mode + '">'
          + '<div class="budget-card-top">'
          + '<span class="budget-card-icon" style="background:' + iconColor + '22;border:1px solid ' + iconColor + '44">' + emoji + '</span>'
          + '<button class="budget-edit-btn" data-category="' + b.category + '" aria-label="Edit budget for ' + b.category + '">'
          + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
          + '</button></div>'
          + '<div class="budget-card-label">' + b.category + '</div>'
          + '<div class="budget-card-amount">' + fmt(b.actual) + '</div>'
          + (b.budget > 0
              ? '<div class="budget-card-limit">of ' + fmt(b.budget) + '</div>'
              : '<div class="budget-card-limit no-budget">no budget set</div>')
          + '<div class="budget-card-track">'
          + '<div class="budget-card-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%;background:'
          + (cls === 'ok' ? 'var(--green)' : cls === 'warn' ? 'var(--yellow)' : 'var(--red)') + '"></div>'
          + '</div></div>';
      }).join('') : '<div class="budget-empty">No expenses this period</div>'}
    </div>`;

  const donutSectionHtml = hasSpend ? `
    <div class="section-title">Spending Breakdown <span class="section-hint">tap a slice to see records</span></div>
    <div class="chart-wrap"><div class="chart-container"><canvas id="donut-chart"></canvas></div></div>` : '';

  const trendSectionHtml = trend.length >= 2 ? `
    <div class="section-title">Spending Trend <span class="section-hint">last ${trend.length} months</span></div>
    <div class="chart-wrap"><div class="chart-container trend-wrap"><canvas id="trend-chart"></canvas></div></div>` : '';

  const comparisonSectionHtml = comparison ? `
    <div class="section-title">vs Previous Period <span class="section-hint">${comparison.prevPeriod}</span></div>
    <div class="budget-list">
      ${comparison.rows.map(r => {
        const arrow    = r.pct === null ? '' : r.pct > 0 ? '↑' : r.pct < 0 ? '↓' : '=';
        const badgeCls = r.pct === null ? 'new' : r.pct > 0 ? 'up' : r.pct < 0 ? 'down' : 'neutral';
        const pctLabel = r.pct === null ? 'new' : r.pct === 0 ? '= same' : `${arrow} ${Math.abs(r.pct).toFixed(0)}%`;
        return `<div class="comparison-row">
          <div class="comparison-left">
            <span class="budget-category">${r.category}</span>
            <span class="comparison-amounts">${fmt(r.current)}${r.prev ? ` · was ${fmt(r.prev)}` : ''}</span>
          </div>
          <span class="comparison-badge ${badgeCls}">${pctLabel}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  const weeklySectionHtml = (weekly.length > 0 || dow.some(([, v]) => v > 0)) ? `
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
    </details>` : '';

  const recurringSectionHtml = recurring.length > 0 ? `
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
    </div>` : '';

  const owesSectionHtml = openReimbursements.length > 0 ? `
    <div class="section-title">Owes You <span class="section-hint">${openReimbursements.length} open</span></div>
    <div class="budget-list">
      ${openReimbursements.map(r => `
      <div class="owes-row" data-name="${encodeURIComponent(r.name)}">
        <div class="owes-left">
          <span class="budget-category">${r.name}</span>
          <span class="owes-status owes-${r.status.toLowerCase()}">${r.status}</span>
        </div>
        <span class="owes-amount">${fmt(r.outstanding)}</span>
      </div>`).join('')}
    </div>` : '';

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
          <span class="planned-dash-projected ${projectedBalance < 0 ? 'negative' : 'positive'}">${projectedBalance < 0 ? '−' : ''}${fmt(projectedBalance)}</span>
        </div>
      </div>`;
  })();

  // Map of section id → HTML; order and visibility controlled by settings
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
    planned:    plannedSectionHtml,
  };

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
        <div class="summary-card card-income clickable-card" id="card-income">
          <div class="card-label">Income</div>
          <div class="card-value">${fmt(summary.income)}</div>
          <div class="card-tap-hint">tap to see →</div>
        </div>
        <div class="summary-card card-expense clickable-card" id="card-expense">
          <div class="card-label">Expenses</div>
          <div class="card-value">${fmt(summary.expenses)}</div>
          <div class="card-tap-hint">tap to see →</div>
        </div>
        <div class="summary-card card-balance">
          <div class="card-label">Balance</div>
          <div class="card-value ${summary.balance >= 0 ? 'positive' : 'negative'}">
            ${summary.balance >= 0 ? '' : '−'} ${fmt(summary.balance)}
          </div>
        </div>
        <div class="summary-card card-savings">
          <div class="card-label">Safe Limit</div>
          <div class="card-value ${safeLimit !== null ? 'positive' : ''}">
            ${safeLimit !== null ? `${fmt(Math.round(safeLimit))} / day` : '—'}
          </div>
          ${daysUntilPayday !== null
            ? `<div class="card-tap-hint">payday in ${daysUntilPayday} day${daysUntilPayday === 1 ? '' : 's'}</div>`
            : ''}
        </div>
      </div>

      <!-- Needs-review banner (always shown) -->
      ${summary.needsReview > 0 ? `
      <div class="review-banner">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" flex-shrink="0">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>
        </svg>
        <span>${summary.needsReview} transaction${summary.needsReview > 1 ? 's' : ''} need${summary.needsReview === 1 ? 's' : ''} review</span>
      </div>` : ''}

      <!-- Configurable sections — ordered + filtered by Dashboard Settings -->
      ${buildSections(sectionHtmlMap, loadSections())}

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

  // Owes You rows → Records searched by person name
  el.querySelectorAll('.owes-row').forEach(row => {
    row.addEventListener('click', () => {
      navigate('transactions', { search: decodeURIComponent(row.dataset.name) });
    });
  });

  // Planned dashboard card → planned expenses page
  el.querySelector('#planned-dash-card')?.addEventListener('click', () => {
    navigate('planned');
  });

  // Refresh
  el.querySelector('#refresh-btn')?.addEventListener('click', () => {
    clearCache();
    state.periods = [];
    renderDashboard(el);
  });

  // Spent card → breakdown page (uses current period + mode)
  el.querySelector('#spent-card')?.addEventListener('click', () => {
    navigate('breakdown', { period, mode });
  });

  // Merchant card → merchants page (uses current period + mode)
  el.querySelector('#merchant-card')?.addEventListener('click', () => {
    navigate('merchants', { period, mode });
  });

  // Today strip → daily view for today
  el.querySelector('#today-strip')?.addEventListener('click', () => {
    navigate('daily', { date: new Date().toISOString().slice(0, 10) });
  });

  // Income card → transactions filtered to income only
  el.querySelector('#card-income')?.addEventListener('click', () => {
    navigate('transactions', { direction: 'income', period, mode });
  });

  // Expense card → transactions filtered to expenses only
  el.querySelector('#card-expense')?.addEventListener('click', () => {
    navigate('transactions', { direction: 'expense', period, mode });
  });

  // Budget cards → transactions filtered by category + period
  // (ignore clicks that originated on the pencil edit button)
  el.querySelectorAll('.budget-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.budget-edit-btn')) return;
      navigate('transactions', {
        category: card.dataset.category,
        period:   card.dataset.period,
        mode:     card.dataset.mode,
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
            if (category) navigate('transactions', { category, period: periods[periodIndex], mode });
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
              navigate('transactions', { period, weekNum, mode });
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

  const vv = window.visualViewport;
  const onViewportChange = () => {
    if (!vv) return;
    sheet.style.top       = `${vv.offsetTop}px`;
    sheet.style.height    = `${vv.height}px`;
    panel.style.maxHeight = `${vv.height}px`; // prevent panel overflowing above overlay
  };
  if (vv) {
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
  }

  const close = () => {
    if (vv) {
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
    }
    sheet.style.top       = '';
    sheet.style.height    = '';
    panel.style.maxHeight = '';
    panel.classList.remove('open');
    setTimeout(() => sheet.remove(), 280);
  };

  sheet.querySelector('.sheet-backdrop').addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  saveBtn.addEventListener('click', async () => {
    const raw          = input.value.trim();
    const parsedAmount = Math.round(parseFloat(raw) || 0);
    // Treat 0 or empty the same way: for new budgets, nothing to save; for existing, clear the cell
    if (parsedAmount <= 0 && isNew) { close(); return; }
    const amount = parsedAmount > 0 ? parsedAmount : '';

    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    try {
      if (isNew) {
        await appendBudgetRow(b.category, amount);
      } else {
        await updateBudgetAmount(b._row, amount);
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
        await updateBudgetAmount(b._row, '');
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
