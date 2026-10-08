import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, todayStr } from './format.js';
import { getHouseholdMembers } from './household.js';
import { computeBalance } from './balance.js';
import { getCommentCounts, deleteCommentsFor, openCommentsSheet } from './comments.js';

const ENTITY_TYPE = 'expense';

const TABLE = 'expenses';
const SETTLEMENTS_TABLE = 'settlements';
const RECURRING_TABLE = 'recurring_expenses';
const CUSTOM_CATEGORIES_TABLE = 'custom_categories';
// Exported so statements.js can categorize parsed bank transactions
// against the exact same taxonomy expenses use, rather than inventing a
// second, slightly-different category list to keep in sync by hand.
// New categories are appended at the end, never inserted earlier in the
// list — colorIndex below is each category's fixed array position, so
// inserting one earlier would silently reassign every later category's
// chart color. This is the fixed, hardcoded base; a household can add
// its own on top via custom_categories (see fetchCustomCategories()/
// mergeCategories() below and openManageCategoriesSheet()) — those are
// never written back into this constant, they're merged in fresh at
// render time by whichever module needs the full list.
export const CATEGORIES = ['groceries', 'bills', 'rent', 'transport', 'household', 'leisure', 'other', 'food', 'pet', 'online shopping'];

// Household-shared, same as the rest of the Expenses taxonomy — see
// supabase/migrations/0040_custom_categories.sql. `direction` ('out' |
// 'in') only matters once a category reaches My Statements' merged list
// (statements.js's CATEGORY_DIRECTION); a logged expense is always an
// outflow, so this file's own pickers never expose or need it.
export async function fetchCustomCategories(householdId) {
  return fetchRows(CUSTOM_CATEGORIES_TABLE, householdId, 'name', true).catch(() => []);
}

// Merges the hardcoded CATEGORIES with a household's custom ones into
// one flat list of names, keyed by direction (default 'out' for every
// hardcoded category — statements.js adds its own 'income' on top of
// this result, see its own buildStatementCategories()). Pure function,
// no network/caching of its own — callers fetch fresh each render and
// pass the rows in, same pattern as fetchCategoryRules() in
// statements.js.
export function mergeCategories(customRows) {
  const direction = Object.fromEntries(CATEGORIES.map((cat) => [cat, 'out']));
  const names = [...CATEGORIES];
  for (const row of customRows) {
    if (names.includes(row.name)) continue; // the unique constraint should prevent this, but a stale duplicate is harmless to just skip
    names.push(row.name);
    direction[row.name] = row.direction;
  }
  return { names, direction };
}

// This app has exactly 8 fixed, CVD-validated categorical colors
// (--series-1..8 in styles.css) — per the data-viz palette rule, a 9th
// series is never a generated hue (that risks colliding with an
// existing category's color the moment the list grows), it folds into a
// shared neutral instead. categoryColor() is that single source of
// truth for both this file's and statements.js's category breakdown
// charts, so the two can never disagree on a category's color.
export function categoryColor(cat) {
  const idx = CATEGORIES.indexOf(cat);
  return idx >= 0 && idx < 8 ? `var(--series-${idx + 1})` : 'var(--text-muted)';
}
const RECURRING_INTERVAL_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Monthly', days: 30 },
  { label: 'Yearly', days: 365 },
  { label: 'Custom', days: null },
];

// Every sheet below that builds a category <select> reads this instead
// of the bare CATEGORIES constant — refreshed once at the top of
// render() (mergeCategories(await fetchCustomCategories(...))) so a
// household's custom categories show up in every picker without
// threading an extra parameter through every single sheet-opening
// function. Module-private, same "plain top-level `let` that survives a
// render() rebuild" pattern money.js already uses for its own
// `activeSub`. Starts as just the hardcoded list so anything that runs
// before the first render() (none today, but defensive) still works.
let categoryNames = [...CATEGORIES];

// Remembers the last category picked on the Add expense form, per
// household, so the next entry starts on whatever was used most recently
// (groceries then groceries then bills, say) instead of always resetting
// to the first entry in the category list. Falls back silently if
// storage is unavailable — same tolerance as theme.js/changelog.js.
function lastCategoryKey(householdId) {
  return `lastExpenseCategory:${householdId}`;
}
function getLastCategory(householdId) {
  try {
    const stored = localStorage.getItem(lastCategoryKey(householdId));
    return categoryNames.includes(stored) ? stored : categoryNames[0];
  } catch {
    return categoryNames[0];
  }
}
function setLastCategory(householdId, category) {
  try {
    localStorage.setItem(lastCategoryKey(householdId), category);
  } catch {
    // Won't persist across reloads — the form just falls back to the
    // first category next time, a harmless degradation.
  }
}

// "This month" total + category breakdown — same contribution-bar/
// legend visual as the goal contributor breakdown in goals.js
// (contributionBreakdown()), just grouping by category instead of by
// who contributed. colorIndex comes from each category's fixed position
// in CATEGORIES (not sort order), so a category keeps the same color
// across months regardless of which categories happen to have spending.
function monthlyBreakdown(rows, currency) {
  const monthPrefix = todayStr().slice(0, 7);
  const thisMonth = rows.filter((r) => r.expense_date.slice(0, 7) === monthPrefix);
  if (!thisMonth.length) return null;

  const total = thisMonth.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalsByCategory = new Map();
  for (const r of thisMonth) {
    const cat = r.category || 'other';
    totalsByCategory.set(cat, (totalsByCategory.get(cat) || 0) + Number(r.amount));
  }
  const categories = [...totalsByCategory.entries()]
    .map(([cat, amount]) => ({ cat, amount, color: categoryColor(cat) }))
    .sort((a, b) => b.amount - a.amount);

  return h('div', { class: 'total-banner', style: 'flex-direction:column;align-items:stretch;gap:8px' }, [
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
      h('span', {}, 'This month'),
      h('span', { class: 'value' }, formatMoney(total, currency)),
    ]),
    h('div', { class: 'contribution-bar' }, categories.map((c) => h('div', {
      class: 'segment',
      style: `width:${(c.amount / total) * 100}%;background:${c.color}`,
    }))),
    h('div', { class: 'contribution-legend' }, categories.map((c) => h('div', { class: 'item' }, [
      h('span', { class: 'swatch', style: `background:${c.color}` }),
      h('span', {}, `${c.cat} · ${formatMoney(c.amount, currency)} (${Math.round((c.amount / total) * 100)}%)`),
    ]))),
  ]);
}

// Two-input split override for a single expense, mirroring the ⚙️
// account sheet's household-default split UI (same auto-complementing
// pair of number inputs). Only meaningful for a two-person household —
// same restriction as the household-wide split setting itself. Returns
// null when there aren't exactly two members, so callers can just skip
// mounting the field.
//
// `initial` is the expense row being edited (or null when adding), used
// to prefill from its existing override if it has one. Left unchanged
// from the household default, getOverride() reports "no override"
// (split_percent: null) rather than freezing in today's default — so an
// un-touched expense keeps tracking the household setting even if it's
// changed later; only an expense someone deliberately typed a different
// number into pins to that specific split forever.
function buildSplitField(members, initial) {
  if (members.length !== 2) return null;
  const [a, b] = members;
  const initialPercentA = initial?.split_percent == null
    ? a.split_percent
    : (initial.split_percent_user_id === a.user_id ? Number(initial.split_percent) : 100 - Number(initial.split_percent));

  const percentA = h('input', { type: 'number', inputmode: 'decimal', min: '0', max: '100', step: '1', value: initialPercentA });
  const percentB = h('input', { type: 'number', inputmode: 'decimal', min: '0', max: '100', step: '1', value: Math.round((100 - initialPercentA) * 100) / 100, disabled: true });
  percentA.addEventListener('input', () => {
    const val = Math.max(0, Math.min(100, parseFloat(percentA.value) || 0));
    percentB.value = Math.round((100 - val) * 100) / 100;
  });

  const field = h('div', { class: 'field' }, [
    h('label', {}, 'Split for this expense'),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, a.display_name), percentA]),
      h('div', { class: 'field' }, [h('label', {}, `${b.display_name} (auto)`), percentB]),
    ]),
    h('div', { class: 'meta' }, `Defaults to your household split (${a.split_percent}/${b.split_percent}) — change it only if this one splits differently.`),
  ]);

  function getOverride() {
    const val = parseFloat(percentA.value);
    if (Math.round(val * 100) === Math.round(Number(a.split_percent) * 100)) {
      return { split_percent: null, split_percent_user_id: null };
    }
    return { split_percent: val, split_percent_user_id: a.user_id };
  }

  return { field, getOverride };
}

// A "personal, not split" toggle — distinct from buildSplitField()
// above, which still splits an expense just at a different ratio. This
// one excludes the expense from the "who owes who" balance entirely
// (computeBalance() in balance.js skips any row with is_personal set),
// for a purchase one partner wants to log without it loading the shared
// balance at all — logging a personal gift, say, without a dishonest
// 100/0 split entry. Hides the split field while checked, since a
// split is moot for an expense that isn't being split.
function buildPersonalToggle(splitField, initial) {
  const checkbox = h('input', { type: 'checkbox', checked: initial });
  checkbox.addEventListener('change', () => {
    if (splitField) splitField.field.style.display = checkbox.checked ? 'none' : '';
  });
  if (splitField && initial) splitField.field.style.display = 'none';
  const field = h('label', { style: 'display:flex;align-items:center;gap:8px;margin:10px 0' }, [
    checkbox,
    'Personal expense — don’t split with my partner',
  ]);
  return { checkbox, field };
}

// ---- Manage categories sheet ---------------------------------------------
// Lets a household add its own categories on top of the hardcoded
// CATEGORIES list, or remove one it added — see custom_categories
// (supabase/migrations/0040_custom_categories.sql). Shared across the
// household (either partner's addition shows up for both) and across
// features (a category added here also becomes pickable on My
// Statements, via statements.js's own merge of the same table — see
// docs/27-feature-bank-statements.md). Exported so statements.js can
// open the exact same sheet rather than building a second one.
//
// `direction` only matters once a category reaches My Statements (a
// logged expense is always an outflow, so this file's own pickers never
// care) — still asked for here, not hidden, since the table itself is
// shared and a household member adding "Side hustle" has to say which
// one they mean regardless of which tab they happened to add it from.
export function openManageCategoriesSheet(ctx, onSaved) {
  const { dialog, body } = makeSheet('Manage categories');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  function categoryRow(row) {
    const deleteBtn = h('button', {
      class: 'btn danger-text small',
      type: 'button',
      onclick: async () => {
        if (!confirm(`Delete the "${row.name}" category? Expenses/transactions already using it keep their category text, but it won’t be pickable for new ones anymore.`)) return;
        const restore = withBusyLabel(deleteBtn, 'Deleting…');
        try {
          await deleteRow(CUSTOM_CATEGORIES_TABLE, row.id);
          await load();
        } catch (err) {
          alert(err.message);
          restore();
        }
      },
    }, 'Delete');
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.name),
          h('div', { class: 'meta' }, row.direction === 'in' ? 'Income (My Statements only)' : 'Expense'),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [deleteBtn]),
    ]);
  }

  const nameInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Side hustle' });
  const directionSelect = h('select', {}, [
    h('option', { value: 'out' }, 'Expense (money out)'),
    h('option', { value: 'in' }, 'Income (money in — only selectable on My Statements)'),
  ]);
  const addErrorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const addBtn = h('button', { class: 'btn primary small', type: 'submit' }, 'Add category');
  const addForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      addErrorEl.style.display = 'none';
      const name = nameInput.value.trim().toLowerCase();
      if (!name) return;
      const restore = withBusyLabel(addBtn, 'Adding…');
      try {
        await insertRow(CUSTOM_CATEGORIES_TABLE, {
          household_id: ctx.household.id,
          name,
          direction: directionSelect.value,
          created_by: ctx.user.id,
        });
        nameInput.value = '';
        await load();
      } catch (err) {
        addErrorEl.textContent = err.message.includes('duplicate') ? `"${name}" already exists.` : err.message;
        addErrorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Name'), nameInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Type'), directionSelect]),
    ]),
    addErrorEl,
    addBtn,
  ]);

  async function load() {
    const rows = await fetchCustomCategories(ctx.household.id);
    mount(body, [
      h('p', { class: 'meta' }, 'Custom categories your household has added, on top of the built-in list. Shared with your partner, and usable on both Expenses and My Statements.'),
      addForm,
      rows.length
        ? h('div', {}, rows.map(categoryRow))
        : h('div', { class: 'empty-state' }, 'No custom categories yet — add one above.'),
    ]);
    if (onSaved) onSaved();
  }

  load();
  openSheet(dialog);
}

function openSettleUpSheet(balance, members, container, ctx) {
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name || 'Someone';
  const { dialog, body } = makeSheet('Settle up');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0.01', required: true, value: balance.amount });
  const dateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Record payment');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
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
        restore();
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
    submitBtn,
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
  const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, value: row.amount });
  const currencyInput = h('input', { type: 'text', value: row.currency, maxlength: '3', style: 'text-transform:uppercase' });
  const categorySelect = h('select', {}, categoryNames.map((c) => h('option', { value: c, selected: c === row.category }, c)));
  const paidBySelect = h('select', {}, members.map((m) => h('option', { value: m.user_id, selected: m.user_id === row.paid_by }, m.display_name)));
  const dateInput = h('input', { type: 'date', required: true, value: row.expense_date });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, row.notes || '');
  const split = buildSplitField(members, row);
  const personal = buildPersonalToggle(split, row.is_personal);
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await updateRow(TABLE, row.id, {
          title: titleInput.value.trim(),
          amount: parseFloat(amountInput.value),
          currency: (currencyInput.value || 'AUD').toUpperCase(),
          category: categorySelect.value,
          paid_by: paidBySelect.value,
          expense_date: dateInput.value,
          notes: notesInput.value.trim() || null,
          is_personal: personal.checkbox.checked,
          ...(personal.checkbox.checked ? {} : (split ? split.getOverride() : {})),
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
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
    personal.field,
    split ? split.field : null,
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

function openEditRecurringSheet(row, members, container, ctx) {
  const { dialog, body } = makeSheet('Edit recurring expense');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const isPreset = RECURRING_INTERVAL_PRESETS.some((p) => p.days === row.interval_days);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, value: row.title });
  const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, value: row.amount });
  const currencyInput = h('input', { type: 'text', value: row.currency, maxlength: '3', style: 'text-transform:uppercase' });
  const categorySelect = h('select', {}, categoryNames.map((c) => h('option', { value: c, selected: c === row.category }, c)));
  const paidBySelect = h('select', {}, members.map((m) => h('option', { value: m.user_id, selected: m.user_id === row.paid_by }, m.display_name)));
  const nextDueInput = h('input', { type: 'date', required: true, value: row.next_due_date });
  const customIntervalInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', placeholder: 'Days', value: row.interval_days, style: isPreset ? 'display:none' : 'display:block' });
  const intervalSelect = h('select', {
    onchange: () => { customIntervalInput.style.display = intervalSelect.value === 'custom' ? 'block' : 'none'; },
  }, RECURRING_INTERVAL_PRESETS.map((p) => h('option', { value: p.days === null ? 'custom' : String(p.days), selected: isPreset ? p.days === row.interval_days : p.days === null }, p.label)));
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, row.notes || '');
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const intervalDays = intervalSelect.value === 'custom' ? parseInt(customIntervalInput.value, 10) : parseInt(intervalSelect.value, 10);
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await updateRow(RECURRING_TABLE, row.id, {
          title: titleInput.value.trim(),
          amount: parseFloat(amountInput.value),
          currency: (currencyInput.value || 'AUD').toUpperCase(),
          category: categorySelect.value,
          paid_by: paidBySelect.value,
          next_due_date: nextDueInput.value,
          interval_days: intervalDays,
          notes: notesInput.value.trim() || null,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
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
    h('div', { class: 'field' }, [h('label', {}, 'Next due date'), nextDueInput]),
    h('div', { class: 'field' }, [h('label', {}, 'How often?'), intervalSelect, customIntervalInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

// Matches title, category, notes, or who paid — case-insensitive
// substring, no fancy tokenizing. The total/balance banners stay based
// on the full list regardless of search; search is for finding a
// specific expense, not for scoping what counts toward the balance.
function matchesSearch(row, memberName, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    row.title.toLowerCase().includes(q) ||
    (row.category || '').toLowerCase().includes(q) ||
    (row.notes || '').toLowerCase().includes(q) ||
    memberName(row.paid_by).toLowerCase().includes(q)
  );
}

export async function render(container, ctx) {
  const [rows, members, settlements, recurringRows, commentCounts, customCategories] = await Promise.all([
    fetchRows(TABLE, ctx.household.id, 'expense_date', false),
    getHouseholdMembers(ctx.household.id),
    fetchRows(SETTLEMENTS_TABLE, ctx.household.id, 'settlement_date', false),
    fetchRows(RECURRING_TABLE, ctx.household.id, 'next_due_date', true),
    getCommentCounts(ctx.household.id, ENTITY_TYPE),
    fetchCustomCategories(ctx.household.id),
  ]);
  // Refreshed every render() so a category your partner just added shows
  // up the next time you open a form, without threading it through every
  // sheet-opening function below as its own parameter — see categoryNames'
  // own comment above.
  categoryNames = mergeCategories(customCategories).names;
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
        h('button', { class: 'btn danger-text small', onclick: async () => { if (!confirm('Delete this settlement record?')) return; await deleteRow(SETTLEMENTS_TABLE, s.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  function card(row) {
    // A personal expense (is_personal) isn't split at all, so the split
    // note is moot — shown instead of it, not alongside, same reasoning
    // the "Personal expense" checkbox hides the split field in the forms.
    const personalNote = row.is_personal ? ' · personal' : '';
    const splitNote = (row.is_personal || row.split_percent == null)
      ? ''
      : (() => {
          const [a, b] = members;
          const pctA = row.split_percent_user_id === a.user_id ? Number(row.split_percent) : 100 - Number(row.split_percent);
          return ` · split ${a.display_name} ${Math.round(pctA)}/${b.display_name} ${Math.round(100 - pctA)}`;
        })();
    // Only shown when it differs from "paid by" — usually the same
    // person, so repeating it ("paid by Alex · added by Alex") would just
    // be noise; it's informative only for the case someone logs an
    // expense their partner actually paid for.
    const addedByNote = row.created_by && row.created_by !== row.paid_by ? ` · added by ${memberName(row.created_by)}` : '';
    const commentCount = commentCounts.get(row.id) || 0;
    const commentLabel = (count) => (count ? `${count} comment${count === 1 ? '' : 's'}` : 'Comments');
    const commentBtn = h('button', {
      class: 'btn secondary small',
      'aria-label': commentLabel(commentCount),
      onclick: () => openCommentsSheet(ENTITY_TYPE, row.id, row.title, members, ctx, (count) => {
        commentCounts.set(row.id, count);
        commentBtn.textContent = `💬 ${count || ''}`.trim();
        commentBtn.setAttribute('aria-label', commentLabel(count));
      }),
    }, `💬 ${commentCount || ''}`.trim());
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${formatDate(row.expense_date)} · ${row.category || 'uncategorized'} · paid by ${memberName(row.paid_by)}${personalNote}${splitNote}${addedByNote}`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: 'amount' }, formatMoney(row.amount, row.currency)),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        commentBtn,
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row, members, container, ctx) }, 'Edit'),
        h('button', {
          class: 'btn danger-text small',
          onclick: async () => {
            if (!confirm('Delete this expense?')) return;
            await deleteCommentsFor(ENTITY_TYPE, row.id);
            await deleteRow(TABLE, row.id);
            render(container, ctx);
          },
        }, 'Delete'),
      ]),
    ]);
  }

  function recurringCard(row) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${row.category || 'uncategorized'} · paid by ${memberName(row.paid_by)} · every ${row.interval_days}d`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: 'amount' }, formatMoney(row.amount, row.currency)),
          h('span', { class: `pill ${row.active ? 'ok' : ''}` }, row.active ? `Next ${formatDate(row.next_due_date)}` : 'Paused'),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', {
          class: 'btn secondary small',
          onclick: async () => { await updateRow(RECURRING_TABLE, row.id, { active: !row.active }); render(container, ctx); },
        }, row.active ? 'Pause' : 'Resume'),
        h('button', { class: 'btn secondary small', onclick: () => openEditRecurringSheet(row, members, container, ctx) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { if (!confirm('Delete this recurring expense? Future charges will stop being logged.')) return; await deleteRow(RECURRING_TABLE, row.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog: recurringDialog, body: recurringBody } = makeSheet('Add recurring expense');
  const recurringErrorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const recurringTitleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Netflix' });
  const recurringAmountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const recurringCurrencyInput = h('input', { type: 'text', value: ctx.household.default_currency || 'AUD', maxlength: '3', style: 'text-transform:uppercase' });
  const recurringCategorySelect = h('select', {}, categoryNames.map((c) => h('option', { value: c }, c)));
  const recurringPaidBySelect = h('select', {}, members.map((m) => h('option', { value: m.user_id, selected: m.user_id === ctx.user.id }, m.display_name)));
  const recurringNextDueInput = h('input', { type: 'date', required: true, value: todayStr() });
  const recurringCustomIntervalInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', placeholder: 'Days', style: 'display:none' });
  const recurringIntervalSelect = h('select', {
    onchange: () => { recurringCustomIntervalInput.style.display = recurringIntervalSelect.value === 'custom' ? 'block' : 'none'; },
  }, RECURRING_INTERVAL_PRESETS.map((p) => h('option', { value: p.days === null ? 'custom' : String(p.days), selected: p.days === 30 }, p.label)));
  const recurringNotesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  const recurringSubmitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save');

  const recurringForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      recurringErrorEl.style.display = 'none';
      const intervalDays = recurringIntervalSelect.value === 'custom' ? parseInt(recurringCustomIntervalInput.value, 10) : parseInt(recurringIntervalSelect.value, 10);
      const restore = withBusyLabel(recurringSubmitBtn, 'Saving…');
      try {
        await insertRow(RECURRING_TABLE, {
          household_id: ctx.household.id,
          title: recurringTitleInput.value.trim(),
          amount: parseFloat(recurringAmountInput.value),
          currency: (recurringCurrencyInput.value || 'AUD').toUpperCase(),
          category: recurringCategorySelect.value,
          paid_by: recurringPaidBySelect.value,
          next_due_date: recurringNextDueInput.value,
          interval_days: intervalDays,
          notes: recurringNotesInput.value.trim() || null,
          created_by: ctx.user.id,
        });
        closeSheet(recurringDialog);
        render(container, ctx);
      } catch (err) {
        recurringErrorEl.textContent = err.message;
        recurringErrorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), recurringTitleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), recurringAmountInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Currency'), recurringCurrencyInput]),
    ]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), recurringCategorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Paid by'), recurringPaidBySelect]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Next due date'), recurringNextDueInput]),
    h('div', { class: 'field' }, [h('label', {}, 'How often?'), recurringIntervalSelect, recurringCustomIntervalInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), recurringNotesInput]),
    recurringErrorEl,
    recurringSubmitBtn,
  ]);
  mount(recurringBody, recurringForm);

  const recurringSection = h('details', { class: 'goal-section', open: recurringRows.length > 0 }, [
    h('summary', {}, `Recurring expenses (${recurringRows.length})`),
    h('div', { class: 'goal-section-body' }, [
      h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(recurringDialog) }, '+ Add recurring expense'),
      recurringRows.length ? h('div', {}, recurringRows.map(recurringCard)) : h('div', { class: 'empty-state' }, 'No recurring expenses yet — subscriptions, insurance, anything that repeats.'),
      recurringDialog,
    ]),
  ]);

  const { dialog, body } = makeSheet('Add expense');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Weekly shop' });
  const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const currencyInput = h('input', { type: 'text', value: ctx.household.default_currency || 'AUD', maxlength: '3', style: 'text-transform:uppercase' });
  const lastCategory = getLastCategory(ctx.household.id);
  const categorySelect = h('select', {}, categoryNames.map((c) => h('option', { value: c, selected: c === lastCategory }, c)));
  const paidBySelect = h('select', {}, members.map((m) => h('option', { value: m.user_id, selected: m.user_id === ctx.user.id }, m.display_name)));
  const dateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  const addSplit = buildSplitField(members, null);
  const personal = buildPersonalToggle(addSplit, false);
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save expense');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
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
          is_personal: personal.checkbox.checked,
          ...(personal.checkbox.checked ? {} : (addSplit ? addSplit.getOverride() : {})),
        });
        setLastCategory(ctx.household.id, categorySelect.value);
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Currency'), currencyInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Paid by'), paidBySelect]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
    personal.field,
    addSplit ? addSplit.field : null,
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);

  const searchInput = h('input', { type: 'search', placeholder: 'Search expenses…' });
  const listContainer = h('div', {});
  const currentMonthKey = todayStr().slice(0, 7);
  // Grouped by month (newest first) via the same collapsible-card pattern
  // as Goals/Recipes, instead of one long flat list — a household with a
  // few months of history otherwise means scrolling past everything to
  // find an old entry. The current month starts open; everything else
  // starts collapsed. While searching, every group with a match opens
  // (a hit shouldn't hide inside a collapsed month), and groups with no
  // match just don't appear.
  function monthLabel(key) {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  function renderList() {
    const query = searchInput.value.trim();
    const filtered = rows.filter((r) => matchesSearch(r, memberName, query));
    if (!filtered.length) {
      mount(listContainer, [h('div', { class: 'empty-state' }, query ? 'No expenses match your search.' : 'No expenses logged yet.')]);
      return;
    }
    const groups = new Map();
    for (const r of filtered) {
      const key = r.expense_date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const sections = [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, groupRows]) => {
        const groupTotal = groupRows.reduce((sum, r) => sum + Number(r.amount), 0);
        return h('details', { class: 'goal-section', open: query ? true : key === currentMonthKey }, [
          h('summary', {}, `${monthLabel(key)} (${groupRows.length}) · ${formatMoney(groupTotal, ctx.household.default_currency || 'AUD')}`),
          h('div', { class: 'goal-section-body' }, groupRows.map(card)),
        ]);
      });
    mount(listContainer, sections);
  }
  searchInput.addEventListener('input', renderList);
  renderList();

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
    monthlyBreakdown(rows, ctx.household.default_currency || 'AUD'),
    h('div', { class: 'action-chip-row' }, [
      h('a', { class: 'action-chip', href: '#', onclick: (e) => { e.preventDefault(); openManageCategoriesSheet(ctx, () => render(container, ctx)); } }, 'Manage categories'),
    ]),
    balanceBanner,
    recurringSection,
    rows.length ? h('div', { class: 'field' }, searchInput) : null,
    listContainer,
    settlements.length ? h('div', { class: 'section-title' }, 'Settlements') : null,
    ...settlements.map(settlementCard),
    h('button', { class: 'fab', 'aria-label': 'Add expense', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}
