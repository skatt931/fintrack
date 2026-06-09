import { loadData } from '../api.js';
import { navigate } from '../router.js';
import { categoryBadge } from '../categoryIcons.js';
import { openEditSheet } from './transactions.js';
import { fmt, getReportAmount, getTransactionAmountDisplay } from '../utils/format.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const isFuture = date >= today;

  const total = txns.reduce((s, t) => s + getReportAmount(t), 0);

  // Top 3 categories by spend — shown as emoji badges in the header
  const byCat = {};
  for (const t of txns) {
    const cat = t.category || 'Uncategorized';
    byCat[cat] = (byCat[cat] || 0) + getReportAmount(t);
  }
  const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 3);

  el.innerHTML = `
    <div class="daily-page">

      <button class="bp-back daily-back-link" id="daily-back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Overview
      </button>

      <div class="daily-hero">
        <div class="daily-nav">
          <button class="daily-nav-btn" id="prev-day" aria-label="Previous day">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="daily-nav-label">
            ${isToday ? '<span class="daily-today-badge">Today</span>' : '<span class="daily-today-badge daily-today-badge-muted">Daily view</span>'}
            <span class="daily-nav-date">${fmtDayFull(date)}</span>
          </div>
          <button class="daily-nav-btn" id="next-day" aria-label="Next day" ${isFuture ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        ${txns.length > 0 ? `
        <div class="daily-header">
          <div class="daily-total">${fmt(total)}</div>
          <div class="daily-cat-chips">
            ${topCats.map(([cat]) => categoryBadge(cat, 'sm')).join('')}
          </div>
        </div>` : `
        <div class="daily-empty-card">
          <div class="daily-empty-title">Nothing spent</div>
          <div class="daily-empty-copy">This day is clear, so there is nothing to review here.</div>
        </div>`}
      </div>

      <!-- Transaction list -->
      <div class="txn-list">
        ${txns.length > 0 ? txns.map(t => {
          const amountDisplay = getTransactionAmountDisplay(t);
          const merchant = t.merchant || t.description || t.note || t.Merchant || '';
          const review   = t.needs_review === 'TRUE' || t.needs_review === true;
          const headline = merchant || t.category || 'Expense';
          return `
          <div class="txn-item" data-row="${t._row}">
            ${categoryBadge(t.category, 'sm')}
            <div class="txn-body">
              <div class="txn-main">
                <span class="txn-headline">${headline}</span>
                <span class="txn-amount-stack">
                  <span class="txn-amount expense">−${amountDisplay.primaryLabel}</span>
                  ${amountDisplay.showSecondary ? `<span class="txn-amount-secondary">${amountDisplay.secondaryLabel}</span>` : ''}
                </span>
              </div>
              <div class="txn-sub">
                ${t.category ? `<span class="txn-category-pill">${t.category}</span>` : ''}
                <span>${t.bank || '—'}</span>
                ${review   ? '<span class="txn-badge review">Review</span>' : ''}
              </div>
            </div>
          </div>`;
        }).join('') : ''}
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
      if (txn) openEditSheet(txn, data, el, () => renderDaily(el, { date }));
    });
  });
}
