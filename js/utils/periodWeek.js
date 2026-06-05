const DAY_MS = 86400000;

function normDateKey(str) {
  if (!str) return '';
  const s = String(str).trim();
  const eu = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return s.slice(0, 10);
}

function parseDateAtNoonMs(str) {
  const key = normDateKey(str);
  if (!key) return 0;
  const ms = new Date(`${key}T12:00:00`).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function getFallbackStartDate(transactions, mode, period) {
  const key = mode === 'billing' ? 'billing_period' : 'month';
  const first = [...transactions]
    .filter(t => t?.date && t[key] === period)
    .sort((a, b) => parseDateAtNoonMs(a.date) - parseDateAtNoonMs(b.date))[0];
  return first ? normDateKey(first.date) : '';
}

export function getPeriodStartDate(data, mode, period) {
  if (!period) return '';

  if (mode === 'calendar' && /^\d{4}-\d{2}$/.test(period)) {
    return `${period}-01`;
  }

  if (mode === 'billing') {
    const match = data?.salaryPeriods?.find(p => p?.period === period && p?.start_date);
    if (match?.start_date) return normDateKey(match.start_date);
  }

  return getFallbackStartDate(data?.transactions || [], mode, period);
}

export function getWeekNumberForDate(dateStr, data, mode, period) {
  const dateMs = parseDateAtNoonMs(dateStr);
  const startMs = parseDateAtNoonMs(getPeriodStartDate(data, mode, period));
  if (!dateMs || !startMs || dateMs < startMs) return null;
  const diffDays = Math.floor((dateMs - startMs) / DAY_MS);
  return Math.floor(diffDays / 7) + 1;
}

export function getWeeksForTransactions(txns, data, mode, period) {
  const weeks = new Set(
    txns
      .map(t => getWeekNumberForDate(t?.date, data, mode, period))
      .filter(Boolean)
  );
  return [...weeks].sort((a, b) => a - b);
}
