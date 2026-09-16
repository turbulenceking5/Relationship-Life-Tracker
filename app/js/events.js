import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, todayStr, nextOccurrence } from './format.js';

const TABLE = 'events';
const CATEGORIES = ['birthday', 'anniversary', 'appointment', 'other'];
const DEFAULT_RECURRING_CATEGORIES = ['birthday', 'anniversary'];

function openEditSheet(row, container, ctx) {
  const { dialog, body } = makeSheet('Edit event');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, value: row.title });
  const dateInput = h('input', { type: 'date', required: true, value: row.event_date });
  const recurringInput = h('input', { type: 'checkbox', checked: row.recurring });
  const categorySelect = h('select', {}, CATEGORIES.map((c) => h('option', { value: c, selected: c === row.category }, c)));
  const descInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, row.description || '');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await updateRow(TABLE, row.id, {
          title: titleInput.value.trim(),
          event_date: dateInput.value,
          category: categorySelect.value,
          recurring: recurringInput.checked,
          description: descInput.value.trim() || null,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, [recurringInput, ' Repeats every year (e.g. birthdays, anniversaries)']),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Description'), descInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save changes'),
  ]);
  mount(body, form);
  openSheet(dialog);
}

export async function render(container, ctx) {
  const rows = await fetchRows(TABLE, ctx.household.id, 'event_date', true);
  const today = todayStr();
  const withNext = rows.map((r) => ({ ...r, _next: nextOccurrence(r.event_date, r.recurring) }));
  const upcoming = withNext.filter((r) => r._next >= today).sort((a, b) => (a._next < b._next ? -1 : 1));
  const past = withNext.filter((r) => r._next < today).sort((a, b) => (a._next < b._next ? 1 : -1));

  function card(row) {
    const dateLabel = row.recurring
      ? `Next: ${formatDate(row._next)} · repeats yearly`
      : formatDate(row.event_date);
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${dateLabel}${row.category ? ' · ' + row.category : ''}`),
          row.description ? h('div', { class: 'meta', style: 'margin-top:4px' }, row.description) : null,
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row, container, ctx) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet('Add event');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Sam’s birthday' });
  const dateInput = h('input', { type: 'date', required: true, value: today });
  const recurringInput = h('input', { type: 'checkbox', checked: DEFAULT_RECURRING_CATEGORIES.includes(CATEGORIES[0]) });
  const categorySelect = h('select', {
    onchange: () => { recurringInput.checked = DEFAULT_RECURRING_CATEGORIES.includes(categorySelect.value); },
  }, CATEGORIES.map((c) => h('option', { value: c }, c)));
  const descInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          event_date: dateInput.value,
          category: categorySelect.value,
          recurring: recurringInput.checked,
          description: descInput.value.trim() || null,
          created_by: ctx.user.id,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, [recurringInput, ' Repeats every year (e.g. birthdays, anniversaries)']),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Description'), descInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save event'),
  ]);
  mount(body, form);

  const list = [
    h('div', { class: 'section-title' }, 'Upcoming'),
    ...(upcoming.length ? upcoming.map(card) : [h('div', { class: 'empty-state' }, 'No upcoming events yet.')]),
  ];
  if (past.length) {
    list.push(h('div', { class: 'section-title' }, 'Past'));
    list.push(...past.slice(0, 20).map(card));
  }

  mount(container, [
    h('div', {}, list),
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
