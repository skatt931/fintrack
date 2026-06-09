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

/** Parse a Sheets-returned amount (may be a number, or a string with thousand
 *  separators) into a number. Returns 0 for empty / non-numeric input. */
export function parseAmount(val) {
  if (typeof val === 'number') return val;
  return parseFloat(String(val ?? '').replace(/,/g, '')) || 0;
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
  const code   = (currency || 'CZK').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || code;
  return `${num} ${symbol}`;
}

/** Just the symbol, for places that build their own format string. */
export function currencySymbol(code) {
  const c = (code || 'CZK').toUpperCase();
  return CURRENCY_SYMBOLS[c] || c;
}
