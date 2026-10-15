import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, dueStatus, todayStr, addDays, nextDueDateFromDaysOfMonth } from './format.js';

const INTERVAL_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Fortnightly', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Custom interval (days)', days: null },
];
const DATES_OPTION_VALUE = 'dates';

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

// "Due Xd" for a fixed day-count interval, or "15th & 30th of the
// month" for a row on explicit calendar days (due_days_of_month) --
// see buildCadenceField() below for why a row stores exactly one of
// the two.
function cadenceLabel(row) {
  if (row.due_days_of_month?.length) {
    return `${row.due_days_of_month.map(ordinal).join(' & ')} of the month`;
  }
  return `every ${row.interval_days}d`;
}

// A row of 31 tappable day-of-month toggles for buildCadenceField()
// below — multiple days can be active at once (e.g. the 15th AND the
// 30th), each one independent rather than the single-active-at-a-time
// behavior of the .segmented filter chips elsewhere in the app, so this
// gets its own .day-grid/.day-chip styling instead of reusing those.
function buildDayGrid(selectedDays) {
  const selected = new Set(selectedDays);
  const buttons = [];
  for (let day = 1; day <= 31; day++) {
    const btn = h('button', {
      type: 'button',
      class: selected.has(day) ? 'day-chip active' : 'day-chip',
      onclick: () => {
        if (selected.has(day)) selected.delete(day);
        else selected.add(day);
        btn.className = selected.has(day) ? 'day-chip active' : 'day-chip';
      },
    }, String(day));
    buttons.push(btn);
  }
  const grid = h('div', { class: 'day-grid' }, buttons);
  return { grid, getSelected: () => [...selected].sort((a, b) => a - b) };
}

// The "How often?" control shared by the Add and Edit forms below --
// one of two cadence shapes is stored per row: a fixed day-count
// interval (interval_days -- the weekly/fortnightly/monthly presets, or
// a typed custom number), or an explicit set of calendar days each
// month (due_days_of_month), for a period that lands on fixed dates
// rather than N days apart -- e.g. BrackenRidge rent actually arriving
// on the 15th and the 30th, which drifts under a fixed interval since
// months aren't all the same length. Exactly one of the two is ever
// stored; switching modes in the form clears the other on save.
function buildCadenceField(initial) {
  const hasDates = Array.isArray(initial?.due_days_of_month) && initial.due_days_of_month.length > 0;
  const isPreset = !hasDates && INTERVAL_PRESETS.some((p) => p.days === initial?.interval_days);

  const customIntervalInput = h('input', {
    type: 'number', inputmode: 'numeric', min: '1', placeholder: 'Days',
    value: initial?.interval_days ?? '',
    style: !hasDates && !isPreset ? 'display:block' : 'display:none',
  });
  const dayGrid = buildDayGrid(hasDates ? initial.due_days_of_month : []);
  const datesWrapper = h('div', { style: hasDates ? 'display:block' : 'display:none' }, [
    h('label', { style: 'margin-top:8px' }, 'Days of the month'),
    dayGrid.grid,
  ]);
  const intervalSelect = h('select', {
    onchange: () => {
      customIntervalInput.style.display = intervalSelect.value === 'custom' ? 'block' : 'none';
      datesWrapper.style.display = intervalSelect.value === DATES_OPTION_VALUE ? 'block' : 'none';
    },
  }, [
    ...INTERVAL_PRESETS.map((p) => h('option', {
      value: p.days === null ? 'custom' : String(p.days),
      selected: !hasDates && (isPreset ? p.days === initial?.interval_days : p.days === null),
    }, p.label)),
    h('option', { value: DATES_OPTION_VALUE, selected: hasDates }, 'Specific day(s) of month'),
  ]);

  function getCadence() {
    if (intervalSelect.value === DATES_OPTION_VALUE) {
      const days = dayGrid.getSelected();
      if (!days.length) throw new Error('Select at least one day of the month.');
      return { interval_days: null, due_days_of_month: days };
    }
    const intervalDays = intervalSelect.value === 'custom' ? parseInt(customIntervalInput.value, 10) : parseInt(intervalSelect.value, 10);
    return { interval_days: intervalDays, due_days_of_month: null };
  }

  const field = h('div', { class: 'field' }, [
    h('label', {}, 'How often?'),
    intervalSelect,
    customIntervalInput,
    datesWrapper,
  ]);

  return { field, getCadence };
}

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

    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const labelInput = h('input', { type: 'text', value: row.property_label || '' });
    const dueDateInput = h('input', { type: 'date', required: true, value: row.due_date });
    const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, value: row.amount });
    const cadence = buildCadenceField(row);
    const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        const restore = withBusyLabel(submitBtn, 'Saving…');
        try {
          const { interval_days, due_days_of_month } = cadence.getCadence();
          await updateRow(table, row.id, {
            property_label: labelInput.value.trim() || null,
            due_date: dueDateInput.value,
            amount: parseFloat(amountInput.value),
            interval_days,
            due_days_of_month,
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
      cadence.field,
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
          h('div', { class: 'meta' }, `Due ${formatDate(row.due_date)} · ${cadenceLabel(row)}`),
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
              due_date: row.due_days_of_month?.length
                ? nextDueDateFromDaysOfMonth(row.due_date, row.due_days_of_month)
                : addDays(row.due_date, row.interval_days),
              amount: row.amount,
              currency: row.currency,
              interval_days: row.interval_days,
              due_days_of_month: row.due_days_of_month,
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

            // A legacy row (no next_period_id, from before that column
            // existed) reverts above without knowing what it originally
            // spawned, so if another unpaid period already exists it's
            // left alone rather than guessed at — this can leave two
            // upcoming cards showing at once, which is exactly the
            // confusing case this asks about. Offer to remove it too, but
            // only when there's exactly one other unpaid period (so it's
            // unambiguous which one), and only ever by an explicit confirm
            // that names its own due date/amount — never by silently
            // matching on date/amount.
            if (!removingNext) {
              const otherUnpaid = unpaid.filter((r) => r.id !== row.id);
              if (otherUnpaid.length === 1) {
                const extra = otherUnpaid[0];
                if (confirm(`This leaves two upcoming periods showing — this one (due ${formatDate(row.due_date)}) and one due ${formatDate(extra.due_date)} for ${formatMoney(extra.amount, extra.currency)}. Remove the one due ${formatDate(extra.due_date)} too?`)) {
                  await deleteRow(table, extra.id);
                }
              }
            }
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
  const cadence = buildCadenceField({ interval_days: defaultIntervalDays });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        const { interval_days, due_days_of_month } = cadence.getCadence();
        await insertRow(table, {
          household_id: ctx.household.id,
          property_label: labelInput.value.trim() || null,
          due_date: dueDateInput.value,
          amount: parseFloat(amountInput.value),
          currency: ctx.household.default_currency || 'AUD',
          interval_days,
          due_days_of_month,
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
    cadence.field,
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
