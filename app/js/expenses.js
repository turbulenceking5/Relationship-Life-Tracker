import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, todayStr } from './format.js';
import { getHouseholdMembers } from './household.js';
import { computeBalance } from './balance.js';

const TABLE = 'expenses';
const SETTLEMENTS_TABLE = 'settlements';
const CATEGORIES = ['groceries', 'bills', 'rent', 'transport', 'household', 'leisure', 'other'];

function openSettleUpSheet(balance, members, container, ctx) {
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name || 'Someone';
  const { dialog, body } = makeSheet('Settle up');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0.01', required: true, value: balance.amount });
  const dateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await insertRow(SETTLEMENTS_TABLE, {
          household_id: ctx.household.id,
          from_user: balance.owedBy,
          to_user: balance.owedTo,
          amount: parseFloat(amountInput.value),
          currency: ctx.household.default_currency || 'AUD',
          settlement_date: dateInput.value,
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
    h('p', { class: 'meta' }, `${memberName(balance.owedBy)} pays ${memberName(balance.owedTo)}`),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Record payment'),
  ]);
  mount(body, form);
  openSheet(dialog);
}

function openEditSheet(row, members, container, ctx) {
  const { dialog, body } = makeSheet('Edit expense');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, value: row.title });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, value: row.amount });
  const currencyInput = h('input', { type: 'text', value: row.currency, maxlength: '3', style: 'text-transform:uppercase' });
  const categorySelect = h('select', {}, CATEGORIES.map((c) => h('option', { value: c, selected: c === row.category }, c)));
  const paidBySelect = h('select', {}, members.map((m) => h('option', { value: m.user_id, selected: m.user_id === row.paid_by }, m.display_name)));
  const dateInput = h('input', { type: 'date', required: true, value: row.expense_date });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, row.notes || '');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await updateRow(TABLE, row.id, {
          title: titleInput.value.trim(),
          amount: parseFloat(amountInput.value),
          currency: (currencyInput.value || 'AUD').toUpperCase(),
          category: categorySelect.value,
          paid_by: paidBySelect.value,
          expense_date: dateInput.value,
          notes: notesInput.value.trim() || null,
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
    h('button', { class: 'btn primary', type: 'submit' }, 'Save changes'),
  ]);
  mount(body, form);
  openSheet(dialog);
}

export async function render(container, ctx) {
  const [rows, members, settlements] = await Promise.all([
    fetchRows(TABLE, ctx.household.id, 'expense_date', false),
    getHouseholdMembers(ctx.household.id),
    fetchRows(SETTLEMENTS_TABLE, ctx.household.id, 'settlement_date', false),
  ]);
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name || 'Someone';
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const balance = computeBalance(rows, settlements, members);

  function settlementCard(s) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, `${memberName(s.from_user)} → ${memberName(s.to_user)}`),
          h('div', { class: 'meta' }, `${formatDate(s.settlement_date)}${s.notes ? ' · ' + s.notes : ''}`),
        ]),
        h('div', { class: 'amount' }, formatMoney(s.amount, s.currency)),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(SETTLEMENTS_TABLE, s.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  function card(row) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${formatDate(row.expense_date)} · ${row.category || 'uncategorized'} · paid by ${memberName(row.paid_by)}`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: 'amount' }, formatMoney(row.amount, row.currency)),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row, members, container, ctx) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet('Add expense');
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
  mount(body, form);

  const balanceBanner = balance && !balance.settled
    ? h('div', { class: 'total-banner' }, [
        h('span', {}, `${memberName(balance.owedBy)} owes ${memberName(balance.owedTo)}`),
        h('div', { style: 'display:flex;align-items:center;gap:10px' }, [
          h('span', { class: 'value' }, formatMoney(balance.amount, ctx.household.default_currency || 'AUD')),
          h('button', { class: 'btn secondary small', onclick: () => openSettleUpSheet(balance, members, container, ctx) }, 'Settle up'),
        ]),
      ])
    : balance && balance.settled
      ? h('div', { class: 'total-banner' }, [h('span', {}, "You're all settled up"), h('span', { class: 'value' }, '✓')])
      : null;

  mount(container, [
    h('div', { class: 'total-banner' }, [
      h('span', {}, 'Total logged'),
      h('span', { class: 'value' }, formatMoney(total, ctx.household.default_currency || 'AUD')),
    ]),
    balanceBanner,
    rows.length ? h('div', {}, rows.map(card)) : h('div', { class: 'empty-state' }, 'No expenses logged yet.'),
    settlements.length ? h('div', { class: 'section-title' }, 'Settlements') : null,
    ...settlements.map(settlementCard),
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
