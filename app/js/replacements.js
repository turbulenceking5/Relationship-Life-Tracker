import { h, mount, openSheet, closeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, dueStatus, todayStr } from './format.js';

const TABLE = 'replacement_items';
const PRESETS = [
  { label: 'Every 30 days', days: 30 },
  { label: 'Every 3 months', days: 90 },
  { label: 'Every 6 months', days: 182 },
  { label: 'Every year', days: 365 },
  { label: 'Custom', days: null },
];

export async function render(container, ctx) {
  const rows = await fetchRows(TABLE, ctx.household.id, 'next_due_date', true);

  function card(row) {
    const status = dueStatus(row.next_due_date);
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.name),
          h('div', { class: 'meta' }, `${row.category || 'general'} · last replaced ${formatDate(row.last_replaced_date)}`),
        ]),
        h('span', { class: `pill ${status.cls}` }, status.label),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', {
          class: 'btn secondary small',
          onclick: async () => { await updateRow(TABLE, row.id, { last_replaced_date: todayStr() }); render(container, ctx); },
        }, 'Mark replaced today'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const dialog = h('dialog', {}, []);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const nameInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Tap water filter' });
  const categoryInput = h('input', { type: 'text', placeholder: 'e.g. kitchen' });
  const lastReplacedInput = h('input', { type: 'date', required: true, value: todayStr() });
  const customDaysInput = h('input', { type: 'number', min: '1', placeholder: 'Days', style: 'display:none' });
  const presetSelect = h('select', {
    onchange: () => { customDaysInput.style.display = presetSelect.value === 'custom' ? 'block' : 'none'; },
  }, PRESETS.map((p, i) => h('option', { value: p.days === null ? 'custom' : String(p.days) }, p.label)));

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const intervalDays = presetSelect.value === 'custom' ? parseInt(customDaysInput.value, 10) : parseInt(presetSelect.value, 10);
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          name: nameInput.value.trim(),
          category: categoryInput.value.trim() || null,
          last_replaced_date: lastReplacedInput.value,
          interval_days: intervalDays,
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
    h('h2', {}, 'Add replacement item'),
    h('div', { class: 'field' }, [h('label', {}, 'Name'), nameInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Category'), categoryInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Last replaced'), lastReplacedInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Replace how often?'), presetSelect, customDaysInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save item'),
  ]);
  mount(dialog, h('div', { class: 'sheet' }, form));

  mount(container, [
    rows.length ? h('div', {}, rows.map(card)) : h('div', { class: 'empty-state' }, 'No replacement items tracked yet — add the tap filter, smoke alarm batteries, anything on a cycle.'),
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
