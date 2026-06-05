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
