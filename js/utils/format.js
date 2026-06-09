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

export function fmtTxn(n, currency = 'CZK') {
  const abs = Math.abs(Number(n) || 0);
  const hasFraction = Math.abs(abs - Math.round(abs)) > 0.0001;
  const num = new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs);
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
  // The sheet's report_amount formula is the authoritative analytics value.
  // If the column exists on the row, mirror it exactly instead of trying to
  // reconstruct debt / reimbursement / transfer logic locally.
  if (txn && Object.prototype.hasOwnProperty.call(txn, 'report_amount')) {
    return parseAmount(txn.report_amount);
  }

  const originalAmount = getOriginalAmount(txn);
  const fxRate = getFxRate(txn);
  const currency = normalizeCurrency(txn?.currency);

  if (txn?.exclude_from_reports === 'TRUE' || txn?.exclude_from_reports === true) return 0;
  if (txn?.link_role === 'reimbursement') return 0;
  if (txn?.direction === 'transfer' || txn?.type === 'transfer' || txn?.link_role === 'transfer_pair') return 0;

  const convertedAmount = originalAmount * (currency === 'CZK' ? 1 : fxRate);
  if (txn?.link_role === 'original_expense') {
    return Math.max(0, convertedAmount - parseAmount(txn?.linked_reimbursement_total));
  }

  return convertedAmount;
}

export function getTransactionAmountDisplay(txn) {
  const originalAmount = getOriginalAmount(txn);
  const reportAmount = getReportAmount(txn);
  const currency = normalizeCurrency(txn?.currency);
  const convertedOriginal = originalAmount * (currency === 'CZK' ? 1 : getFxRate(txn));
  const reportAdjusted = Math.abs(reportAmount - convertedOriginal) > 0.005;
  const showConvertedSecondary = currency !== 'CZK' && reportAmount > 0 && !reportAdjusted;

  if (reportAdjusted) {
    return {
      originalAmount,
      reportAmount,
      primaryLabel: fmtTxn(reportAmount),
      secondaryLabel: originalAmount > 0 ? fmtTxn(originalAmount, currency) : '',
      showSecondary: originalAmount > 0,
    };
  }

  return {
    originalAmount,
    reportAmount,
    primaryLabel: fmtTxn(originalAmount, currency),
    secondaryLabel: showConvertedSecondary ? fmtTxn(reportAmount) : '',
    showSecondary: showConvertedSecondary,
  };
}
