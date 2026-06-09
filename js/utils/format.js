// ── Period labels ────────────────────────────────────────────────────────────

export function formatPeriodLabel(period, locale = 'en-GB') {
  if (!period) return period;

  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-');
    return new Date(Number(year), Number(month) - 1, 1).toLocaleString(locale, {
      month: 'long',
      year: 'numeric',
    });
  }

  return period;
}

// ── Amount + currency formatting ─────────────────────────────────────────────
// Single source of truth. Replaces the per-file duplicates of parseAmount/fmt.

// Known currency code → display symbol. Extend as new currencies appear.
const CURRENCY_SYMBOLS = {
  CZK: 'Kč',
  EUR: '€',
  USD: '$',
  GBP: '£',
  PLN: 'zł',
  CHF: 'CHF',
};

function normalizeCurrency(code) {
  return (code || 'CZK').toUpperCase();
}

/** Parse a Sheets-returned amount (may be a number, or a string with thousand
 *  separators) into a number. Returns 0 for empty / non-numeric input. */
export function parseAmount(val) {
  if (typeof val === 'number') return val;
  const raw = String(val ?? '').trim();
  if (!raw) return 0;

  // Google Sheets returns formatted values by default, so we normalise common
  // thousands separators and both decimal conventions before parsing.
  const compact = raw.replace(/[\s\u00A0\u202F]/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');

  if (hasComma && hasDot) {
    const lastComma = compact.lastIndexOf(',');
    const lastDot = compact.lastIndexOf('.');
    if (lastComma > lastDot) {
      return parseFloat(compact.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(compact.replace(/,/g, '')) || 0;
  }

  if (hasComma) {
    const commaCount = compact.split(',').length - 1;
    if (commaCount === 1) return parseFloat(compact.replace(',', '.')) || 0;
    return parseFloat(compact.replace(/,/g, '')) || 0;
  }

  if (hasDot) {
    const dotCount = compact.split('.').length - 1;
    if (dotCount === 1) return parseFloat(compact) || 0;
    return parseFloat(compact.replace(/\./g, '')) || 0;
  }

  return parseFloat(compact) || 0;
}

/** Format an amount with the appropriate currency symbol.
 *  Default currency is CZK so existing aggregation call sites (which don't
 *  know which currency the underlying transactions used) keep their current
 *  behaviour. Per-transaction display sites should pass `t.currency`.
 *
 *  Unknown codes fall back to the raw ISO code (e.g. "100 NOK"). Empty /
 *  null / undefined currency falls back to "Kč". */
export function fmt(n, currency = 'CZK') {
  const num = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })
    .format(Math.abs(n));
  const code   = normalizeCurrency(currency);
  const symbol = CURRENCY_SYMBOLS[code] || code;
  return `${num} ${symbol}`;
}

/** Just the symbol, for places that build their own format string. */
export function currencySymbol(code) {
  const c = normalizeCurrency(code);
  return CURRENCY_SYMBOLS[c] || c;
}

export function getOriginalAmount(txn) {
  return parseAmount(txn?.amount);
}

export function getFxRate(txn) {
  const code = normalizeCurrency(txn?.currency);
  if (code === 'CZK') return 1;
  const rate = parseAmount(txn?.fx_rate);
  return rate > 0 ? rate : 0;
}

export function getReportAmount(txn) {
  const rawReportAmount = txn?.report_amount;
  if (rawReportAmount !== '' && rawReportAmount != null) {
    return parseAmount(rawReportAmount);
  }

  const originalAmount = getOriginalAmount(txn);
  const fxRate = getFxRate(txn);
  const currency = normalizeCurrency(txn?.currency);
  const hasLocalConversion = originalAmount > 0 && (currency === 'CZK' || fxRate > 0);

  if (txn?.exclude_from_reports === 'TRUE' || txn?.exclude_from_reports === true) return 0;
  if (txn?.link_role === 'reimbursement') return 0;
  if (txn?.direction === 'transfer' || txn?.type === 'transfer' || txn?.link_role === 'transfer_pair') return 0;

  const convertedAmount = originalAmount * (currency === 'CZK' ? 1 : fxRate);
  if (txn?.link_role === 'original_expense') {
    return Math.max(0, convertedAmount - parseAmount(txn?.linked_reimbursement_total));
  }

  return convertedAmount;
}
