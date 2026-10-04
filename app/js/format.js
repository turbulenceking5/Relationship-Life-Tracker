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

// A "YYYY-MM-DD" string from a Date's LOCAL components — never
// toISOString(), which converts to UTC and can land on the wrong day for
// anyone east of UTC (same reasoning as todayStr()).
function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// "YYYY-MM-DD" + n days, in local time throughout (toDateStr(), not
// toISOString()) — used anywhere a due/reminder date needs to roll
// forward by a fixed number of days (rent.js's "mark as paid → next
// period," personal-todos.js's daily/weekly repeat). Was previously
// duplicated in both of those files; one of the two copies used
// toISOString() and was quietly off by a day for anyone east of UTC
// (Brisbane included) for the exact reason todayStr()'s comment warns
// about — consolidating here fixes that, not just the duplication.
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// For a recurring event, maps it onto its occurrence within the CURRENT
// cycle for the given interval — never rolls forward into the next cycle
// even if that occurrence has already gone by. For a non-recurring event,
// just returns the date unchanged. Used by both the Events tab (to split
// Upcoming from Done) and the home dashboard's "Coming up" feed (to drop
// a passed birthday/appointment instead of showing it early with its next
// occurrence's date) — see docs/03-feature-events.md.
//
// - yearly: month/day mapped onto the current calendar year.
// - monthly: day-of-month mapped onto the current calendar month, clamped
//   to that month's last day (so day 31 doesn't overflow a 30-day month).
// - weekly/fortnightly: there's no calendar-aligned "week" concept
//   elsewhere in the app, so these roll forward from the event's own
//   anchor date in fixed 7/14-day steps instead of snapping to a calendar
//   boundary — the most recent step that isn't in the future, or the
//   anchor date itself if the very first occurrence hasn't happened yet.
export function currentOccurrence(dateStr, recurring, interval) {
  if (!dateStr || !recurring) return dateStr;
  const today = todayStr();

  if (interval === 'monthly') {
    const [, , day] = dateStr.split('-');
    const [ty, tm] = today.split('-');
    const daysInMonth = new Date(Number(ty), Number(tm), 0).getDate();
    const clampedDay = Math.min(Number(day), daysInMonth);
    return `${ty}-${tm}-${String(clampedDay).padStart(2, '0')}`;
  }

  if (interval === 'weekly' || interval === 'fortnightly') {
    const stepDays = interval === 'weekly' ? 7 : 14;
    const anchor = new Date(dateStr + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    const diffDays = Math.round((t - anchor) / 86400000);
    if (diffDays < 0) return dateStr;
    const cycles = Math.floor(diffDays / stepDays);
    const occ = new Date(anchor);
    occ.setDate(occ.getDate() + cycles * stepDays);
    return toDateStr(occ);
  }

  // yearly (default/fallback)
  const [, month, day] = dateStr.split('-');
  return `${today.slice(0, 4)}-${month}-${day}`;
}

// Companion to currentOccurrence() above, for a recurring event with
// rotate_assignee set (see docs/03-feature-events.md): how many full
// cycles have elapsed since the event's own anchor date, used to
// alternate the assignee (even cycle count = the anchor assignee, odd =
// the other household member). Same per-interval cycle math as
// currentOccurrence(), just returning the cycle count instead of mapping
// it onto a date.
export function occurrenceCycleCount(dateStr, recurring, interval) {
  if (!dateStr || !recurring) return 0;
  const today = todayStr();

  if (interval === 'monthly') {
    const [ay, am] = dateStr.split('-');
    const [ty, tm] = today.split('-');
    return Math.max(0, (Number(ty) - Number(ay)) * 12 + (Number(tm) - Number(am)));
  }

  if (interval === 'weekly' || interval === 'fortnightly') {
    const stepDays = interval === 'weekly' ? 7 : 14;
    const anchor = new Date(dateStr + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    const diffDays = Math.round((t - anchor) / 86400000);
    return diffDays < 0 ? 0 : Math.floor(diffDays / stepDays);
  }

  // yearly (default/fallback)
  const [ay] = dateStr.split('-');
  const [ty] = today.split('-');
  return Math.max(0, Number(ty) - Number(ay));
}

// Shared overdue/due-soon/ok day-threshold bucketing behind dueStatus()
// (below) and expiryStatus() (documents.js, for a document's expiry
// rather than a bill's due date) — a threshold change here updates both
// at once instead of relying on two hand-copied day-count checks staying
// in sync. Callers vary only the label wording via `labels`; `today` and
// `ok` are optional since expiryStatus() doesn't special-case "today"
// and shows no label once something isn't expiring soon.
export function dayThresholdStatus(days, labels) {
  if (days == null) return { label: '', cls: '' };
  if (days < 0) return { label: labels.overdue(Math.abs(days)), cls: 'overdue' };
  if (days === 0 && labels.today) return { label: labels.today(), cls: 'due-soon' };
  if (days <= 14) return { label: labels.soon(days), cls: 'due-soon' };
  return { label: labels.ok ? labels.ok(days) : '', cls: 'ok' };
}

export function dueStatus(dateStr) {
  return dayThresholdStatus(daysUntil(dateStr), {
    overdue: (d) => `Overdue ${d}d`,
    today: () => 'Due today',
    soon: (d) => `Due in ${d}d`,
    ok: (d) => `Due in ${d}d`,
  });
}
