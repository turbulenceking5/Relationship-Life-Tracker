import { h, mount, openSheet, closeSheet } from './dom.js';
import { fetchRows, insertRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, todayStr } from './format.js';
import { getHouseholdMembers } from './household.js';

const TABLE = 'expenses';
const CATEGORIES = ['groceries', 'bills', 'rent', 'transport', 'household', 'leisure', 'other'];

export async function render(container, ctx) {
  const [rows, members] = await Promise.all([
    fetchRows(TABLE, ctx.household.id, 'expense_date', false),
    getHouseholdMembers(ctx.household.id),
  ]);
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name || 'Someone';
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  function card(row) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${formatDate(row.expense_date)} · ${row.category || 'uncategorized'} · paid by ${memberName(row.paid_by)}`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: 'amount' }, formatMoney(row.amount, row.currency)),
          h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
        ]),
      ]),
    ]);
  }

  const dialog = h('dialog', {}, []);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Weekly shop' });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const currencyInput = h('input', { type: 'text', value: ctx.household.default_currency || 'AUD', maxlength: '3', style: 'text-transform:uppercase' });
  const categorySelect = h('select', {}, CATEGORIES.map((c) => h('option', { value: c }, c)));
  const paidBySelect = h('select', {}, members.map((m) => h('option', { value: m.user_id, selected: m.user_id === ctx.user.id }, m.display_name)));
  const dateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          amount: parseFloat(amountInput.value),
          currency: (currencyInput.value || 'AUD').toUpperCase(),
          category: categorySelect.value,
          paid_by: paidBySelect.value,
          expense_date: dateInput.value,
          notes: notesInput.value.trim() || null,
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
    h('h2', {}, 'Add expense'),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Currency'), currencyInput]),
    ]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Paid by'), paidBySelect]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save expense'),
  ]);
  mount(dialog, h('div', { class: 'sheet' }, form));

  mount(container, [
    h('div', { class: 'total-banner' }, [
      h('span', {}, 'Total logged'),
      h('span', { class: 'value' }, formatMoney(total, ctx.household.default_currency || 'AUD')),
    ]),
    rows.length ? h('div', {}, rows.map(card)) : h('div', { class: 'empty-state' }, 'No expenses logged yet.'),
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
