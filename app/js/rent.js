import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, dueStatus, todayStr } from './format.js';

const RENT_TABLE = 'rent_payments';
const RENT_INTERVAL_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Fortnightly', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Custom', days: null },
];

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function openEditSheet(row, container, ctx) {
  const { dialog, body } = makeSheet('Edit rent period');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const isPreset = RENT_INTERVAL_PRESETS.some((p) => p.days === row.interval_days);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const labelInput = h('input', { type: 'text', value: row.property_label || '' });
  const dueDateInput = h('input', { type: 'date', required: true, value: row.due_date });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, value: row.amount });
  const customIntervalInput = h('input', { type: 'number', min: '1', placeholder: 'Days', value: row.interval_days, style: isPreset ? 'display:none' : 'display:block' });
  const intervalSelect = h('select', {
    onchange: () => { customIntervalInput.style.display = intervalSelect.value === 'custom' ? 'block' : 'none'; },
  }, RENT_INTERVAL_PRESETS.map((p) => h('option', { value: p.days === null ? 'custom' : String(p.days), selected: isPreset ? p.days === row.interval_days : p.days === null }, p.label)));

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const intervalDays = intervalSelect.value === 'custom' ? parseInt(customIntervalInput.value, 10) : parseInt(intervalSelect.value, 10);
      try {
        await updateRow(RENT_TABLE, row.id, {
          property_label: labelInput.value.trim() || null,
          due_date: dueDateInput.value,
          amount: parseFloat(amountInput.value),
          interval_days: intervalDays,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Property (optional)'), labelInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Due date'), dueDateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'How often?'), intervalSelect, customIntervalInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save changes'),
  ]);
  mount(body, form);
  openSheet(dialog);
}

export async function render(container, ctx) {
  const rows = await fetchRows(RENT_TABLE, ctx.household.id, 'due_date', true);
  const unpaid = rows.filter((r) => !r.paid);
  const paid = rows.filter((r) => r.paid).slice(0, 10);

  function card(row) {
    const status = row.paid
      ? { label: `Received ${formatDate(row.paid_date)}`, cls: 'ok' }
      : dueStatus(row.due_date);
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.property_label || 'BrackenRidge Rent'),
          h('div', { class: 'meta' }, `Due ${formatDate(row.due_date)} · every ${row.interval_days}d`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: 'amount owed_to_us' }, formatMoney(row.amount, row.currency)),
          h('span', { class: `pill ${status.cls}` }, status.label),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        !row.paid && h('button', {
          class: 'btn secondary small',
          onclick: async () => {
            await updateRow(RENT_TABLE, row.id, { paid: true, paid_date: todayStr() });
            await insertRow(RENT_TABLE, {
              household_id: ctx.household.id,
              property_label: row.property_label,
              due_date: addDays(row.due_date, row.interval_days),
              amount: row.amount,
              currency: row.currency,
              interval_days: row.interval_days,
              created_by: ctx.user.id,
            });
            render(container, ctx);
          },
        }, 'Mark as received'),
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row, container, ctx) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(RENT_TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet('Add rent period');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const labelInput = h('input', { type: 'text', placeholder: 'e.g. BrackenRidge' });
  const dueDateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const customIntervalInput = h('input', { type: 'number', min: '1', placeholder: 'Days', style: 'display:none' });
  const intervalSelect = h('select', {
    onchange: () => { customIntervalInput.style.display = intervalSelect.value === 'custom' ? 'block' : 'none'; },
  }, RENT_INTERVAL_PRESETS.map((p) => h('option', { value: p.days === null ? 'custom' : String(p.days), selected: p.days === 14 }, p.label)));
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const intervalDays = intervalSelect.value === 'custom' ? parseInt(customIntervalInput.value, 10) : parseInt(intervalSelect.value, 10);
      try {
        await insertRow(RENT_TABLE, {
          household_id: ctx.household.id,
          property_label: labelInput.value.trim() || null,
          due_date: dueDateInput.value,
          amount: parseFloat(amountInput.value),
          currency: ctx.household.default_currency || 'AUD',
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
    h('div', { class: 'field' }, [h('label', {}, 'Property (optional)'), labelInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Due date'), dueDateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'How often?'), intervalSelect, customIntervalInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  ]);
  mount(body, form);

  mount(container, [
    h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(dialog) }, '+ Add rent period'),
    unpaid.length ? h('div', {}, unpaid.map(card)) : h('div', { class: 'empty-state' }, 'No upcoming rent tracked yet.'),
    paid.length ? h('div', { class: 'section-title' }, 'Recently received') : null,
    ...paid.map(card),
    dialog,
  ]);
}
