import { h, mount, openSheet, closeSheet } from './dom.js';
import { fetchRows, insertRow, deleteRow } from './crud.js';
import { formatDate, todayStr } from './format.js';

const TABLE = 'events';
const CATEGORIES = ['birthday', 'anniversary', 'appointment', 'other'];

export async function render(container, ctx) {
  const rows = await fetchRows(TABLE, ctx.household.id, 'event_date', true);
  const today = todayStr();
  const upcoming = rows.filter((r) => r.event_date >= today);
  const past = rows.filter((r) => r.event_date < today).reverse();

  function card(row) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${formatDate(row.event_date)}${row.category ? ' · ' + row.category : ''}`),
          row.description ? h('div', { class: 'meta', style: 'margin-top:4px' }, row.description) : null,
        ]),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const dialog = h('dialog', {}, []);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Sam’s birthday' });
  const dateInput = h('input', { type: 'date', required: true, value: today });
  const categorySelect = h('select', {}, CATEGORIES.map((c) => h('option', { value: c }, c)));
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
    h('h2', {}, 'Add event'),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Description'), descInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save event'),
  ]);
  mount(dialog, h('div', { class: 'sheet' }, form));

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
