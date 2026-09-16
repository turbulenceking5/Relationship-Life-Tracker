export function formatMoney(amount, currency = 'GBP') {
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
  return new Date().toISOString().slice(0, 10);
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
