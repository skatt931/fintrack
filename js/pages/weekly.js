import { loadData } from '../api.js';
import { navigate } from '../router.js';
import { categoryBadge } from '../categoryIcons.js';
import { formatPeriodLabel } from '../utils/format.js';
import { getWeekNumberForDate, getWeeksForTransactions } from '../utils/periodWeek.js';
import { openEditSheet } from './transactions.js';

function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function fmt(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.abs(n)) + ' Kč';
}

function parseDateMs(str) {
  if (!str) return 0;
  const s = str.trim();
  const euMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (euMatch) return new Date(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`).getTime();
  const iso = s.slice(0, 10);
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function normDateKey(str) {
  if (!str) return '';
  const s = str.trim();
  const eu = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return s.slice(0, 10);
}

function fmtDateGroup(str) {
  if (!str) return '';
  const d = new Date(str.slice(0, 10));
  if (isNaN(d)) return str.slice(0, 10);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getCurrentPeriod(data, mode) {
  const today = new Date().toISOString().slice(0, 10);

  if (mode === 'billing') {
    const sorted = [...data.salaryPeriods]
      .filter(p => p.start_date && p.period)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (sorted.length) {
      let result = sorted[0].period;
      for (const sp of sorted) {
        if (sp.start_date <= today) result = sp.period;
        else break;
      }
      return result;
    }
    const bps = [...new Set(data.transactions.map(t => t.billing_period).filter(Boolean))].sort();
    if (bps.length) return bps[bps.length - 1];
  }

  const thisMonth = today.slice(0, 7);
  const months = [...new Set(data.transactions.map(t => t.month).filter(Boolean))].sort();
  if (months.includes(thisMonth)) return thisMonth;
  if (months.length) return months[months.length - 1];
  return thisMonth;
}

function groupByDate(txns) {
  const groups = {};
  for (const t of txns) {
    const day = normDateKey(t.date);
    if (!groups[day]) groups[day] = [];
    groups[day].push(t);
  }
  return Object.entries(groups).sort(([a], [b]) => parseDateMs(b) - parseDateMs(a));
}

function fmtRangeLabel(txns) {
  if (!txns.length) return '';
  const sorted = [...txns].sort((a, b) => parseDateMs(a.date) - parseDateMs(b.date));
  const start = new Date(normDateKey(sorted[0].date) + 'T12:00:00');
  const end = new Date(normDateKey(sorted[sorted.length - 1].date) + 'T12:00:00');
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString('en-GB', { month: 'long' })}`;
  }
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export function renderWeekly(el, params = {}) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading…</span></div>`;

  loadData()
    .then(data => {
      const mode = params.mode || 'billing';
      const period = params.period || getCurrentPeriod(data, mode);
      const key = mode === 'billing' ? 'billing_period' : 'month';
      const periodTxns = data.transactions.filter(t => t.direction === 'expense' && t[key] === period);
      const weeks = getWeeksForTransactions(periodTxns, data, mode, period);
      const weekNum = params.weekNum || weeks[0] || 1;
      const txns = periodTxns.filter(t => getWeekNumberForDate(t.date, data, mode, period) === weekNum);
      renderPage(el, data, { mode, period, weekNum, weeks, txns });
    })
    .catch(err => {
      el.innerHTML = `<div class="weekly-page"><div class="error-msg">${err.message}</div></div>`;
    });
}

function renderPage(el, data, { mode, period, weekNum, weeks, txns }) {
  const groups = groupByDate(txns);
  const total = txns.reduce((sum, t) => sum + parseAmount(t.report_amount), 0);
  const byCat = {};
  for (const t of txns) {
    const cat = t.category || 'Uncategorized';
    byCat[cat] = (byCat[cat] || 0) + parseAmount(t.report_amount);
  }
  const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 3);
  const index = weeks.indexOf(weekNum);
  const prevWeek = index > 0 ? weeks[index - 1] : null;
  const nextWeek = index >= 0 && index < weeks.length - 1 ? weeks[index + 1] : null;
  const rangeLabel = fmtRangeLabel(txns);

  el.innerHTML = `
    <div class="weekly-page">

      <button class="bp-back weekly-back-link" id="weekly-back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Records
      </button>

      <div class="weekly-hero">
        <div class="weekly-nav">
          <button class="daily-nav-btn" id="prev-week" aria-label="Previous week" ${prevWeek === null ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="daily-nav-label">
            <span class="daily-today-badge daily-today-badge-muted">${mode === 'billing' ? 'Billing week' : 'Month week'}</span>
            <span class="daily-nav-date">Week ${weekNum}</span>
            <span class="weekly-range">${formatPeriodLabel(period)}${rangeLabel ? ` · ${rangeLabel}` : ''}</span>
          </div>
          <button class="daily-nav-btn" id="next-week" aria-label="Next week" ${nextWeek === null ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        ${txns.length > 0 ? `
        <div class="daily-header weekly-header">
          <div class="daily-total">${fmt(total)}</div>
          <div class="daily-cat-chips">
            ${topCats.map(([cat]) => categoryBadge(cat, 'sm')).join('')}
          </div>
        </div>` : `
        <div class="daily-empty-card">
          <div class="daily-empty-title">No spending in this week</div>
          <div class="daily-empty-copy">This week is empty, so there is nothing to review here.</div>
        </div>`}
      </div>

      <div class="txn-list">
        ${groups.length ? groups.map(([day, items]) => {
          const dayTotal = items.reduce((sum, t) => sum + parseAmount(t.report_amount), 0);
          return `
          <button class="txn-date-header txn-date-header--link" data-date="${day}">
            <span>${fmtDateGroup(day)}</span>
            <span class="txn-date-meta">
              <span class="txn-date-total">−${fmt(dayTotal)}</span>
              <span class="txn-date-count">${items.length}</span>
            </span>
          </button>
          ${items.map(t => {
            const amt = parseAmount(t.report_amount);
            const merchant = t.merchant || t.description || t.note || t.Merchant || '';
            const review = t.needs_review === 'TRUE' || t.needs_review === true;
            const headline = merchant || t.category || 'Expense';
            return `
            <div class="txn-item" data-row="${t._row}">
              ${categoryBadge(t.category, 'sm')}
              <div class="txn-body">
                <div class="txn-main">
                  <span class="txn-headline">${headline}</span>
                  <span class="txn-amount expense">−${fmt(amt)}</span>
                </div>
                <div class="txn-sub">
                  ${t.category ? `<span class="txn-category-pill">${t.category}</span>` : ''}
                  <span>${t.bank || '—'}</span>
                  ${review ? '<span class="txn-badge review">Review</span>' : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        `;}).join('') : ''}
      </div>

    </div>
  `;

  el.querySelector('#weekly-back').addEventListener('click', () => {
    navigate('transactions', { period, mode });
  });

  el.querySelector('#prev-week').addEventListener('click', () => {
    if (prevWeek !== null) navigate('weekly', { period, weekNum: prevWeek, mode });
  });

  el.querySelector('#next-week').addEventListener('click', () => {
    if (nextWeek !== null) navigate('weekly', { period, weekNum: nextWeek, mode });
  });

  el.querySelectorAll('.txn-date-header--link').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate('daily', { date: btn.dataset.date });
    });
  });

  el.querySelectorAll('.txn-item').forEach(item => {
    item.addEventListener('click', () => {
      const row = parseInt(item.dataset.row, 10);
      const txn = data.transactions.find(t => t._row === row);
      if (txn) openEditSheet(txn, data, el, () => renderWeekly(el, { period, weekNum, mode }));
    });
  });
}
