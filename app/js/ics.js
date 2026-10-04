// Minimal ICS (RFC 5545) building + download, for a one-tap "add to
// calendar" download of a single event — not a subscribable feed (that's
// a separate Phase 5 stretch goal, see ROADMAP.md). Kept generic rather
// than events.js-only, since rent/mortgage/goal due dates could reuse
// buildIcsEvent() later for the same kind of one-off download.
function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function icsDateStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// `dateStr` is a plain "YYYY-MM-DD" — every date in this app is all-day,
// nothing stores a specific time. DTEND is the next calendar day, per
// RFC 5545's convention that an all-day VEVENT's end date is exclusive.
export function buildIcsEvent({ uid, title, dateStr, description }) {
  const start = dateStr.replace(/-/g, '');
  const endDate = new Date(dateStr + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const end = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relationship Life Tracker//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@relationship-life-tracker`,
    `DTSTAMP:${icsDateStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(filename, icsText) {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
