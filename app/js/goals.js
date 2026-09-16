import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow, upsertRow } from './crud.js';
import { formatDate, formatMoney, dueStatus, daysUntil, todayStr } from './format.js';
import { supabase } from './supabaseClient.js';

const RENT_TABLE = 'rent_payments';
const WEDDING_TXN_TABLE = 'wedding_transactions';
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

async function fetchWeddingFund(householdId) {
  const { data, error } = await supabase.from('wedding_fund').select('*').eq('household_id', householdId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function render(container, ctx) {
  mount(container, [
    h('div', { class: 'section-title' }, 'Investment Property Rent'),
    h('div', { id: 'goals-rent-section' }, h('div', { class: 'empty-state' }, 'Loading…')),
    h('div', { class: 'section-title', style: 'margin-top:28px' }, 'Wedding Fund'),
    h('div', { id: 'goals-wedding-section' }, h('div', { class: 'empty-state' }, 'Loading…')),
  ]);

  const rentSection = container.querySelector('#goals-rent-section');
  const weddingSection = container.querySelector('#goals-wedding-section');

  await Promise.all([
    renderRentSection(rentSection, ctx),
    renderWeddingSection(weddingSection, ctx),
  ]);
}

// ---------------------------------------------------------------------
// Rent
// ---------------------------------------------------------------------

async function renderRentSection(section, ctx) {
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
          h('h3', {}, row.property_label || 'Rent'),
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
            renderRentSection(section, ctx);
          },
        }, 'Mark as received'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(RENT_TABLE, row.id); renderRentSection(section, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet('Add rent period');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const labelInput = h('input', { type: 'text', placeholder: 'e.g. 12 Smith St' });
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
        renderRentSection(section, ctx);
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

  mount(section, [
    h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(dialog) }, '+ Add rent period'),
    unpaid.length ? h('div', {}, unpaid.map(card)) : h('div', { class: 'empty-state' }, 'No upcoming rent tracked yet.'),
    paid.length ? h('div', { class: 'section-title' }, 'Recently received') : null,
    ...paid.map(card),
    dialog,
  ]);
}

// ---------------------------------------------------------------------
// Wedding fund
// ---------------------------------------------------------------------

function weddingCountdown(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return '';
  if (days === 0) return "It's today! \u{1F389}";
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} to go`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
}

async function renderWeddingSection(section, ctx, editingGoal = false) {
  const [fund, transactions] = await Promise.all([
    fetchWeddingFund(ctx.household.id),
    fetchRows(WEDDING_TXN_TABLE, ctx.household.id, 'transaction_date', false),
  ]);

  const currency = (fund && fund.currency) || ctx.household.default_currency || 'AUD';
  const saved = transactions.filter((t) => t.type === 'saved').reduce((sum, t) => sum + Number(t.amount), 0);
  const spent = transactions.filter((t) => t.type === 'spent').reduce((sum, t) => sum + Number(t.amount), 0);
  const target = fund && fund.target_amount != null ? Number(fund.target_amount) : null;
  const remaining = target !== null ? Math.max(target - saved, 0) : null;
  const hasGoal = Boolean(fund && (target !== null || fund.wedding_date));

  function goalForm(showCancel) {
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const dateInput = h('input', { type: 'date', value: fund?.wedding_date || '' });
    const targetInput = h('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', value: target !== null ? target : '' });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        try {
          await upsertRow('wedding_fund', {
            household_id: ctx.household.id,
            wedding_date: dateInput.value || null,
            target_amount: targetInput.value ? parseFloat(targetInput.value) : null,
            currency,
          }, 'household_id');
          renderWeddingSection(section, ctx, false);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      },
    }, [
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [h('label', {}, 'Wedding date'), dateInput]),
        h('div', { class: 'field' }, [h('label', {}, 'Target amount'), targetInput]),
      ]),
      errorEl,
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn primary small', type: 'submit' }, 'Save goal'),
        showCancel ? h('button', { class: 'btn secondary small', type: 'button', onclick: () => renderWeddingSection(section, ctx, false) }, 'Cancel') : null,
      ]),
    ]);
    return h('div', { class: 'card' }, form);
  }

  const { dialog, body } = makeSheet('Add wedding transaction');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const typeSelect = h('select', {}, [
    h('option', { value: 'saved' }, 'Saved toward the fund'),
    h('option', { value: 'spent' }, 'Spent on the wedding'),
  ]);
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Venue deposit' });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const dateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await insertRow(WEDDING_TXN_TABLE, {
          household_id: ctx.household.id,
          type: typeSelect.value,
          title: titleInput.value.trim(),
          amount: parseFloat(amountInput.value),
          transaction_date: dateInput.value,
          notes: notesInput.value.trim() || null,
          created_by: ctx.user.id,
        });
        closeSheet(dialog);
        renderWeddingSection(section, ctx, editingGoal);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Type'), typeSelect]),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  ]);
  mount(body, form);

  function txnCard(t) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, t.title),
          h('div', { class: 'meta' }, `${formatDate(t.transaction_date)}${t.notes ? ' · ' + t.notes : ''}`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: `amount ${t.type === 'saved' ? 'positive' : 'negative'}` }, `${t.type === 'saved' ? '+' : '-'}${formatMoney(t.amount, currency)}`),
          h('span', { class: 'pill' }, t.type === 'saved' ? 'Saved' : 'Spent'),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(WEDDING_TXN_TABLE, t.id); renderWeddingSection(section, ctx, editingGoal); } }, 'Delete'),
      ]),
    ]);
  }

  const content = [];

  if (!hasGoal || editingGoal) {
    if (!hasGoal) content.push(h('p', { class: 'meta' }, 'Set a target amount and date to start tracking your wedding fund.'));
    content.push(goalForm(hasGoal));
  } else {
    content.push(h('div', { class: 'total-banner' }, [
      h('span', {}, fund.wedding_date ? weddingCountdown(fund.wedding_date) : 'No date set'),
      h('span', { class: 'value' }, fund.wedding_date ? formatDate(fund.wedding_date) : ''),
    ]));
    content.push(h('div', { class: 'card' }, [
      target !== null ? h('div', { class: 'card-row' }, [h('span', {}, 'Target'), h('span', { class: 'amount' }, formatMoney(target, currency))]) : null,
      h('div', { class: 'card-row', style: 'margin-top:6px' }, [h('span', {}, 'Saved so far'), h('span', { class: 'amount positive' }, formatMoney(saved, currency))]),
      h('div', { class: 'card-row', style: 'margin-top:6px' }, [h('span', {}, 'Spent so far'), h('span', { class: 'amount negative' }, formatMoney(spent, currency))]),
      remaining !== null ? h('div', { class: 'card-row', style: 'margin-top:6px' }, [h('span', {}, 'Remaining to save'), h('span', { class: 'amount' }, formatMoney(remaining, currency))]) : null,
    ]));
    content.push(h('button', { class: 'btn text', onclick: () => renderWeddingSection(section, ctx, true) }, 'Edit goal'));
  }

  content.push(h('div', { class: 'section-title' }, 'Transactions'));
  content.push(h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(dialog) }, '+ Add transaction'));
  content.push(transactions.length ? h('div', {}, transactions.map(txnCard)) : h('div', { class: 'empty-state' }, 'No transactions logged yet.'));
  content.push(dialog);

  mount(section, content);
}
