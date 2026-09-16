export function formatMoney(amount, currency = 'AUD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayStr() {
  // Local calendar date, not UTC — toISOString() would return the wrong
  // date for anyone east of UTC (e.g. Australia/Brisbane, UTC+10) for part
  // of the day.
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

export function dueStatus(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return { label: '', cls: '' };
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, cls: 'overdue' };
  if (days === 0) return { label: 'Due today', cls: 'due-soon' };
  if (days <= 14) return { label: `Due in ${days}d`, cls: 'due-soon' };
  return { label: `Due in ${days}d`, cls: 'ok' };
}
