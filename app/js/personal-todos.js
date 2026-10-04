import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, todayStr, dueStatus, addDays } from './format.js';

const TABLE = 'personal_todos';
const REPEAT_OPTIONS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

// Mirrors the advance-to-next-occurrence logic in
// supabase/functions/notify-due-items/index.ts (addDaysUTC/
// addOneMonthUTC there) — a repeating reminder ticked off by hand should
// behave exactly like one the push notification fires: advance to its
// next occurrence and stay active, not get permanently marked done. Only
// a non-repeating ('none') reminder actually becomes done when checked.
function addOneMonth(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const daysInMonth = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, daysInMonth)).padStart(2, '0')}`;
}
function nextOccurrencePatch(row) {
  if (row.repeat_frequency === 'daily') return { remind_date: addDays(row.remind_date, 1) };
  if (row.repeat_frequency === 'weekly') return { remind_date: addDays(row.remind_date, 7) };
  if (row.repeat_frequency === 'monthly') return { remind_date: addOneMonth(row.remind_date) };
  return { is_done: true };
}

// Formats a "HH:MM:SS" (or "HH:MM") time-of-day column value as a plain
// 12-hour clock string, without pulling in a Date object (a bare time has
// no date component to construct one from safely).
function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')}${period}`;
}

function openEditSheet(row, container, ctx) {
  const { dialog, body } = makeSheet('Edit reminder');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const promptInput = h('textarea', { rows: '2', required: true }, row.prompt);
  const dateInput = h('input', { type: 'date', required: true, value: row.remind_date });
  const timeInput = h('input', { type: 'time', required: true, value: row.remind_time.slice(0, 5) });
  const repeatSelect = h('select', {}, REPEAT_OPTIONS.map((o) => h('option', { value: o.value, selected: o.value === row.repeat_frequency }, o.label)));
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await updateRow(TABLE, row.id, {
          prompt: promptInput.value.trim(),
          remind_date: dateInput.value,
          remind_time: timeInput.value,
          repeat_frequency: repeatSelect.value,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Reminder'), promptInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Time'), timeInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Repeats'), repeatSelect]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

export async function render(container, ctx) {
  // RLS restricts personal_todos to rows where user_id = auth.uid(), so
  // this already returns only the signed-in user's own reminders even
  // though the query itself just filters by household — see
  // docs/20-feature-personal-todos.md.
  const rows = await fetchRows(TABLE, ctx.household.id, 'remind_date', true);
  const active = rows.filter((r) => !r.is_done).sort((a, b) => (a.remind_date + a.remind_time < b.remind_date + b.remind_time ? -1 : 1));
  const done = rows.filter((r) => r.is_done);

  function card(row) {
    const status = !row.is_done ? dueStatus(row.remind_date) : null;
    const meta = `${formatDate(row.remind_date)} at ${formatTime(row.remind_time)}${row.repeat_frequency !== 'none' ? ' · repeats ' + row.repeat_frequency : ''}`;
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', { style: row.is_done ? 'text-decoration:line-through;color:var(--text-muted)' : '' }, row.prompt),
          h('div', { class: 'meta' }, meta),
        ]),
        status && status.cls !== 'ok' ? h('span', { class: `pill ${status.cls}` }, status.label) : null,
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', {
          class: 'btn secondary small',
          // Mirrors notify-due-items' own behavior exactly: a repeating
          // reminder advances to its next occurrence and stays active
          // instead of being permanently marked done (see
          // nextOccurrencePatch() above) — only a non-repeating one
          // actually becomes done, the same case "Mark active" undoes.
          onclick: async () => {
            await updateRow(TABLE, row.id, row.is_done ? { is_done: false } : nextOccurrencePatch(row));
            render(container, ctx);
          },
        }, row.is_done ? 'Mark active' : (row.repeat_frequency === 'none' ? 'Mark done' : 'Done for now')),
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row, container, ctx) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { if (!confirm('Delete this reminder?')) return; await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet('Add reminder');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const promptInput = h('textarea', { rows: '2', required: true, placeholder: 'e.g. Call the vet' });
  const dateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const timeInput = h('input', { type: 'time', required: true, value: '09:00' });
  const repeatSelect = h('select', {}, REPEAT_OPTIONS.map((o) => h('option', { value: o.value }, o.label)));
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save reminder');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          user_id: ctx.user.id,
          prompt: promptInput.value.trim(),
          remind_date: dateInput.value,
          remind_time: timeInput.value,
          repeat_frequency: repeatSelect.value,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Reminder'), promptInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Time'), timeInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Repeats'), repeatSelect]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);

  const searchInput = h('input', { type: 'search', placeholder: 'Search reminders…' });
  const listContainer = h('div', {});
  function renderList() {
    const query = searchInput.value.trim().toLowerCase();
    const matches = (r) => !query || r.prompt.toLowerCase().includes(query);
    const filteredActive = active.filter(matches);
    const filteredDone = done.filter(matches);
    mount(listContainer, [
      h('div', { class: 'section-title' }, 'Active'),
      filteredActive.length ? h('div', {}, filteredActive.map(card)) : h('div', { class: 'empty-state' }, query ? 'No reminders match your search.' : 'Nothing to remind you about yet.'),
      ...(filteredDone.length ? [h('div', { class: 'section-title' }, 'Done'), h('div', {}, filteredDone.slice(0, 20).map(card))] : []),
    ]);
  }
  searchInput.addEventListener('input', renderList);
  renderList();

  mount(container, [
    h('div', { class: 'meta', style: 'margin-bottom:10px' }, "Private to you — your partner can't see this list."),
    rows.length ? h('div', { class: 'field' }, searchInput) : null,
    listContainer,
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
