import { h, mount, openSheet, closeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, dueStatus, todayStr } from './format.js';

const TABLE = 'repayments';

export async function render(container, ctx) {
  const rows = await fetchRows(TABLE, ctx.household.id, 'due_date', true);
  const active = rows.filter((r) => r.status === 'active');
  const other = rows.filter((r) => r.status !== 'active');

  function card(row) {
    const status = row.status === 'active' ? dueStatus(row.due_date) : { label: row.status, cls: row.status === 'paid' ? 'ok' : '' };
    const directionLabel = row.direction === 'owed_to_us' ? "We're owed" : 'We owe';
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${directionLabel}${row.counterparty ? ' · ' + row.counterparty : ''}${row.due_date ? ' · due ' + formatDate(row.due_date) : ''}`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: `amount ${row.direction}` }, formatMoney(row.remaining_amount, row.currency)),
          h('span', { class: `pill ${status.cls}` }, status.label),
        ]),
      ]),
      row.status === 'active' ? h('div', { class: 'actions-row' }, [
        h('button', {
          class: 'btn secondary small',
          onclick: async () => { await updateRow(TABLE, row.id, { status: 'paid', remaining_amount: 0 }); render(container, ctx); },
        }, 'Mark as paid'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]) : h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const dialog = h('dialog', {}, []);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Car loan' });
  const directionSelect = h('select', {}, [
    h('option', { value: 'owed_by_us' }, 'We owe'),
    h('option', { value: 'owed_to_us' }, "We're owed"),
  ]);
  const counterpartyInput = h('input', { type: 'text', placeholder: 'e.g. Mum, the bank' });
  const totalInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const currencyInput = h('input', { type: 'text', value: ctx.household.default_currency || 'AUD', maxlength: '3', style: 'text-transform:uppercase' });
  const dueDateInput = h('input', { type: 'date', value: todayStr() });
  const recurringInput = h('input', { type: 'checkbox' });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        const total = parseFloat(totalInput.value);
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          direction: directionSelect.value,
          counterparty: counterpartyInput.value.trim() || null,
          total_amount: total,
          remaining_amount: total,
          currency: (currencyInput.value || 'AUD').toUpperCase(),
          due_date: dueDateInput.value || null,
          recurring: recurringInput.checked,
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
    h('h2', {}, 'Add repayment'),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Direction'), directionSelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Counterparty'), counterpartyInput]),
    ]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Total amount'), totalInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Currency'), currencyInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Due date'), dueDateInput]),
    h('div', { class: 'field' }, [
      h('label', {}, [recurringInput, ' Recurring']),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save repayment'),
  ]);
  mount(dialog, h('div', { class: 'sheet' }, form));

  const list = [];
  list.push(h('div', { class: 'section-title' }, 'Active'));
  list.push(...(active.length ? active.map(card) : [h('div', { class: 'empty-state' }, 'No active repayments.')]));
  if (other.length) {
    list.push(h('div', { class: 'section-title' }, 'Paid / cancelled'));
    list.push(...other.map(card));
  }

  mount(container, [
    h('div', {}, list),
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
