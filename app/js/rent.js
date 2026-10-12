import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, dueStatus, todayStr, addDays } from './format.js';

const INTERVAL_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Fortnightly', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Custom', days: null },
];

// Rent (money in) and Mortgage (money out) on the same property are the
// same "rolling due/paid period" shape (see rent_payments/
// mortgage_payments in 02-data-model.md) — "mark as paid" both closes
// out the current period and auto-creates the next one, so there's
// always exactly one upcoming unpaid period. This one function drives
// both sections below, parameterized by table name, wording, default
// cadence, and whether the amount reads as income or expense.
//
// It mounts into two separate containers: `currentEl` gets the add
// button and unpaid periods (what you actually act on), `historyEl`
// gets paid periods collapsed behind a <details> — see render() below
// for why they're pulled apart instead of stacked in one list.
async function renderPaymentSection(currentEl, historyEl, ctx, config) {
  const { table, defaultLabel, paidVerb, defaultIntervalDays, amountClass, statusPaidLabel } = config;

  function openEditSheet(row) {
    const { dialog, body } = makeSheet(`Edit ${config.noun}`);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove());

    const isPreset = INTERVAL_PRESETS.some((p) => p.days === row.interval_days);
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const labelInput = h('input', { type: 'text', value: row.property_label || '' });
    const dueDateInput = h('input', { type: 'date', required: true, value: row.due_date });
    const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, value: row.amount });
    const customIntervalInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', placeholder: 'Days', value: row.interval_days, style: isPreset ? 'display:none' : 'display:block' });
    const intervalSelect = h('select', {
      onchange: () => { customIntervalInput.style.display = intervalSelect.value === 'custom' ? 'block' : 'none'; },
    }, INTERVAL_PRESETS.map((p) => h('option', { value: p.days === null ? 'custom' : String(p.days), selected: isPreset ? p.days === row.interval_days : p.days === null }, p.label)));
    const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        const intervalDays = intervalSelect.value === 'custom' ? parseInt(customIntervalInput.value, 10) : parseInt(intervalSelect.value, 10);
        const restore = withBusyLabel(submitBtn, 'Saving…');
        try {
          await updateRow(table, row.id, {
            property_label: labelInput.value.trim() || null,
            due_date: dueDateInput.value,
            amount: parseFloat(amountInput.value),
            interval_days: intervalDays,
          });
          closeSheet(dialog);
          renderPaymentSection(currentEl, historyEl, ctx, config);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
          restore();
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
      submitBtn,
    ]);
    mount(body, form);
    openSheet(dialog);
  }

  const rows = await fetchRows(table, ctx.household.id, 'due_date', true);
  const unpaid = rows.filter((r) => !r.paid);
  const paid = rows.filter((r) => r.paid).slice(0, 20);

  // "Paid on time N periods running" — a quiet, non-competitive momentum
  // signal derived entirely from existing paid_date/due_date history, no
  // new input. Deliberately has no "streak at risk" countdown or
  // per-partner score (the habit-app research this is drawn from flags
  // that framing as an anxiety/obligation trap) — just a shared, low-key
  // nudge, and only shown once it's actually a streak (2+), not for 0/1
  // which would just be noise.
  const onTimeStreak = (() => {
    const mostRecentFirst = [...paid].sort((a, b) => (a.due_date < b.due_date ? 1 : -1));
    let n = 0;
    for (const r of mostRecentFirst) {
      if (!r.paid_date || r.paid_date > r.due_date) break;
      n++;
    }
    return n;
  })();

  function card(row) {
    const status = row.paid
      ? { label: `${statusPaidLabel} ${formatDate(row.paid_date)}`, cls: 'ok' }
      : dueStatus(row.due_date);
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.property_label || defaultLabel),
          h('div', { class: 'meta' }, `Due ${formatDate(row.due_date)} · every ${row.interval_days}d`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: `amount ${amountClass}` }, formatMoney(row.amount, row.currency)),
          h('span', { class: `pill ${status.cls}` }, status.label),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        !row.paid && h('button', {
          class: 'btn secondary small',
          onclick: async () => {
            const next = await insertRow(table, {
              household_id: ctx.household.id,
              property_label: row.property_label,
              due_date: addDays(row.due_date, row.interval_days),
              amount: row.amount,
              currency: row.currency,
              interval_days: row.interval_days,
              created_by: ctx.user.id,
            });
            // Remembers which row this spawned, so an accidental mark can
            // be undone cleanly (see the Undo button below) — not just
            // flipping `paid` back, but also removing that auto-created
            // next period, rather than leaving an orphaned extra one
            // sitting alongside whatever period is really next.
            await updateRow(table, row.id, { paid: true, paid_date: todayStr(), next_period_id: next.id });
            renderPaymentSection(currentEl, historyEl, ctx, config);
          },
        }, paidVerb),
        row.paid && h('button', {
          class: 'btn secondary small',
          onclick: async () => {
            // The spawned next-period row is only safe to remove if
            // nobody's acted on it since — still sitting there unpaid,
            // exactly as auto-created. If it's since been marked paid
            // itself (the household kept going normally after this
            // mistake) or already deleted by hand, leave it alone: only
            // this row's own paid/paid_date gets reverted, and whatever
            // extra unpaid period that leaves behind is something to
            // sort out by hand rather than something safe to guess at
            // and delete.
            const spawned = row.next_period_id ? rows.find((r) => r.id === row.next_period_id) : null;
            const removingNext = spawned && !spawned.paid;
            if (!confirm(removingNext
              ? `Undo marking this ${config.noun} as ${statusPaidLabel.toLowerCase()}? This also removes the next period it created.`
              : `Undo marking this ${config.noun} as ${statusPaidLabel.toLowerCase()}?`)) return;
            if (removingNext) await deleteRow(table, spawned.id);
            await updateRow(table, row.id, { paid: false, paid_date: null, next_period_id: null });
            renderPaymentSection(currentEl, historyEl, ctx, config);
          },
        }, 'Undo'),
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { if (!confirm(`Delete this ${config.noun}?`)) return; await deleteRow(table, row.id); renderPaymentSection(currentEl, historyEl, ctx, config); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet(`Add ${config.noun}`);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const labelInput = h('input', { type: 'text', placeholder: 'e.g. BrackenRidge' });
  const dueDateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const customIntervalInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', placeholder: 'Days', style: 'display:none' });
  const intervalSelect = h('select', {
    onchange: () => { customIntervalInput.style.display = intervalSelect.value === 'custom' ? 'block' : 'none'; },
  }, INTERVAL_PRESETS.map((p) => h('option', { value: p.days === null ? 'custom' : String(p.days), selected: p.days === defaultIntervalDays }, p.label)));
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const intervalDays = intervalSelect.value === 'custom' ? parseInt(customIntervalInput.value, 10) : parseInt(intervalSelect.value, 10);
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await insertRow(table, {
          household_id: ctx.household.id,
          property_label: labelInput.value.trim() || null,
          due_date: dueDateInput.value,
          amount: parseFloat(amountInput.value),
          currency: ctx.household.default_currency || 'AUD',
          interval_days: intervalDays,
          created_by: ctx.user.id,
        });
        closeSheet(dialog);
        renderPaymentSection(currentEl, historyEl, ctx, config);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
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
    submitBtn,
  ]);
  mount(body, form);

  mount(currentEl, [
    onTimeStreak >= 2 ? h('div', { class: 'meta', style: 'margin-bottom:8px' }, `✓ Paid on time ${onTimeStreak} periods running`) : null,
    h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(dialog) }, `+ Add ${config.noun}`),
    unpaid.length ? h('div', {}, unpaid.map(card)) : h('div', { class: 'empty-state' }, config.emptyText),
    dialog,
  ]);

  mount(historyEl, paid.length
    ? h('details', { class: 'goal-section' }, [
        h('summary', {}, `${config.historyLabel} (${paid.length})`),
        h('div', { class: 'goal-section-body' }, paid.map(card)),
      ])
    : []);
}

export async function render(container, ctx) {
  const rentCurrent = h('div', {}, h('div', { class: 'empty-state' }, 'Loading…'));
  const mortgageCurrent = h('div', {}, h('div', { class: 'empty-state' }, 'Loading…'));
  const rentHistory = h('div', {});
  const mortgageHistory = h('div', {});

  // Current (unpaid) periods for both Rent and Mortgage stay up top,
  // where they're actionable. Paid history for both is pulled out to a
  // "History" section at the very bottom, each collapsed behind a
  // <details> by default — otherwise up to 20 paid cards per table sit
  // between the two "current" sections and push Mortgage's own unpaid
  // periods off screen, which is the whole complaint this fixes.
  mount(container, [
    h('div', { class: 'section-title' }, 'Rent'),
    rentCurrent,
    h('div', { class: 'section-title' }, 'Mortgage'),
    mortgageCurrent,
    h('div', { class: 'section-title' }, 'History'),
    rentHistory,
    mortgageHistory,
  ]);

  await Promise.all([
    renderPaymentSection(rentCurrent, rentHistory, ctx, {
      table: 'rent_payments',
      noun: 'rent period',
      defaultLabel: 'BrackenRidge Rent',
      paidVerb: 'Mark as received',
      statusPaidLabel: 'Received',
      defaultIntervalDays: 14,
      amountClass: 'owed_to_us',
      emptyText: 'No upcoming rent tracked yet.',
      historyLabel: 'Rent history',
    }),
    renderPaymentSection(mortgageCurrent, mortgageHistory, ctx, {
      table: 'mortgage_payments',
      noun: 'mortgage payment',
      defaultLabel: 'BrackenRidge Mortgage',
      paidVerb: 'Mark as paid',
      statusPaidLabel: 'Paid',
      defaultIntervalDays: 30,
      amountClass: 'owed_by_us',
      emptyText: 'No upcoming mortgage payments tracked yet.',
      historyLabel: 'Mortgage history',
    }),
  ]);
}
