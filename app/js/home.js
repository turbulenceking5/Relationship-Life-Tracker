import { h, mount, withBusyLabel } from './dom.js';
import { fetchRows } from './crud.js';
import { formatDate, formatMoney, dueStatus, daysUntil, todayStr, currentOccurrence } from './format.js';
import { expiryStatus } from './documents.js';
import { getHouseholdMembers, updateSharedNote } from './household.js';
import { computeBalance } from './balance.js';
import { remindPartner } from './notifications.js';

const CATEGORY_ICONS = { birthday: '🎂', anniversary: '💍', appointment: '📅', other: '📌' };
const GRADIENT_CLASSES = ['grad-a', 'grad-b', 'grad-c', 'grad-d', 'grad-e'];

function gradientClass(seed) {
  let hash = 0;
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENT_CLASSES[hash % GRADIENT_CLASSES.length];
}

// A single freeform note either partner can edit, shown above everything
// else — the one thing on this dashboard likely to change several times
// a day ("grabbed milk already", "home late tonight"), which is exactly
// what turns an app from "checked weekly" into "checked daily" (Cozi-
// style shared message board). "Save" only appears once the text
// actually differs from what's stored, so the common case (just reading
// it) shows no button at all. Saving mutates `ctx.household.shared_note`
// in place so it stays current across tab switches without a re-fetch —
// same pattern `googleDrive.js`'s connect flow uses for `ctx.household`.
function stickyNote(ctx) {
  const textarea = h('textarea', { rows: '2', placeholder: "Leave a note for your partner… (e.g. \"grabbed milk already\")" }, ctx.household.shared_note || '');
  const saveBtn = h('button', { class: 'btn secondary small', style: 'display:none;margin-top:8px' }, 'Save note');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  textarea.addEventListener('input', () => {
    saveBtn.style.display = textarea.value !== (ctx.household.shared_note || '') ? 'inline-flex' : 'none';
  });
  saveBtn.addEventListener('click', async () => {
    errorEl.style.display = 'none';
    const restore = withBusyLabel(saveBtn, 'Saving…');
    try {
      const note = textarea.value.trim() || null;
      await updateSharedNote(ctx.household.id, note);
      ctx.household.shared_note = note;
      saveBtn.style.display = 'none';
      restore();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      restore();
    }
  });
  return h('div', { class: 'card' }, [textarea, saveBtn, errorEl]);
}

export async function render(container, ctx, navigate) {
  const [events, rentPayments, mortgagePayments, documents, goals, expenses, settlements, members, groceryItems, personalTodos] = await Promise.all([
    fetchRows('events', ctx.household.id, 'event_date', true),
    fetchRows('rent_payments', ctx.household.id, 'due_date', true),
    fetchRows('mortgage_payments', ctx.household.id, 'due_date', true),
    fetchRows('documents', ctx.household.id, 'expiry_date', true),
    fetchRows('custom_goals', ctx.household.id, 'target_date', true),
    fetchRows('expenses', ctx.household.id, 'expense_date', false),
    fetchRows('settlements', ctx.household.id, 'settlement_date', false),
    getHouseholdMembers(ctx.household.id),
    fetchRows('grocery_items', ctx.household.id, 'created_at', true),
    fetchRows('personal_todos', ctx.household.id, 'remind_date', true),
  ]);
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name || 'Someone';
  const balance = computeBalance(expenses, settlements, members);
  const groceryToBuyCount = groceryItems.filter((g) => !g.is_done).length;
  // RLS already restricts personal_todos to the signed-in user's own rows
  // (see docs/20-feature-personal-todos.md), so this count is private by
  // construction, same as the My To-dos segment itself.
  const activeTodoCount = personalTodos.filter((t) => !t.is_done).length;

  const today = todayStr();
  // currentOccurrence (never rolling forward to the next cycle) so a
  // recurring event that's already happened this cycle just drops off the
  // dashboard instead of reappearing early with its next occurrence's
  // date — same "has it happened yet this cycle" logic as the Events
  // tab's Upcoming/Done split, just without a Done section to move it
  // into here. Also drops one someone's manually marked done early (see
  // docs/03-feature-events.md) even though its date hasn't arrived yet.
  const soonEvents = events
    .map((e) => ({ ...e, _next: currentOccurrence(e.event_date, e.recurring, e.recurring_interval) }))
    .filter((e) => e._next >= today && e.completed_occurrence !== e._next)
    .sort((a, b) => (a._next < b._next ? -1 : 1))
    .slice(0, 3);
  // Merged and sorted by due date, not grouped by type — otherwise every
  // rent period (regardless of urgency) would show before every mortgage
  // period (or an expiring document) just because rent_payments happened
  // to be fetched first.
  const dueItemsData = [
    ...rentPayments.filter((r) => !r.paid && dueStatus(r.due_date).cls !== 'ok').map((r) => ({ ...r, _kind: 'rent', _due: r.due_date })),
    ...mortgagePayments.filter((r) => !r.paid && dueStatus(r.due_date).cls !== 'ok').map((r) => ({ ...r, _kind: 'mortgage', _due: r.due_date })),
    ...documents.filter((d) => d.expiry_date && expiryStatus(d.expiry_date).cls !== 'ok').map((d) => ({ ...d, _kind: 'document', _due: d.expiry_date })),
  ].sort((a, b) => (a._due < b._due ? -1 : a._due > b._due ? 1 : 0)).slice(0, 5);
  // Goals with a target date that's already gone by just drop off "Coming
  // up" — unlike the Events tab's Upcoming/Done split, the home dashboard
  // is a "what's next" glance, not a record of what's happened, so there's
  // no Done section to move them into.
  const goalsWithDates = goals.filter((g) => g.target_date && g.target_date >= today);

  function row(icon, title, meta, pill, onClick, actions) {
    return h('div', { class: 'card', onclick: onClick, style: onClick ? 'cursor:pointer' : '' }, [
      h('div', { class: 'card-row' }, [
        h('div', { style: 'display:flex;gap:10px;align-items:center' }, [
          icon ? h('div', { class: 'card-icon' }, icon) : null,
          h('div', {}, [h('h3', {}, title), h('div', { class: 'meta' }, meta)]),
        ]),
        pill,
      ]),
      actions ? h('div', { class: 'actions-row', onclick: (e) => e.stopPropagation() }, actions) : null,
    ]);
  }

  // A one-tap nudge for anything overdue enough to show up here, instead
  // of texting your partner separately — see
  // supabase/functions/remind-partner/index.ts. `e.stopPropagation()` on
  // the surrounding `.actions-row` (above) keeps a tap on this button
  // from also triggering the card's own onClick navigation.
  function remindButton(label) {
    const btn = h('button', { class: 'btn secondary small' }, '🔔 Remind');
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const restore = withBusyLabel(btn, 'Sending…');
      try {
        await remindPartner(ctx, label);
        btn.disabled = true;
        btn.textContent = 'Reminded ✓';
        setTimeout(() => { btn.disabled = false; btn.textContent = '🔔 Remind'; busy = false; }, 4000);
      } catch (err) {
        restore();
        busy = false;
        alert(`Couldn't send reminder: ${err.message}`);
      }
    });
    return btn;
  }

  const dueItems = dueItemsData.map((r) => {
    if (r._kind === 'document') {
      const s = expiryStatus(r._due);
      return row('📄', r.title, `Expires ${formatDate(r.expiry_date)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('documents'), [remindButton(`"${r.title}" ${s.label.toLowerCase()}`)]);
    }
    const s = dueStatus(r._due);
    const isRent = r._kind === 'rent';
    const label = r.property_label || (isRent ? 'BrackenRidge Rent' : 'BrackenRidge Mortgage');
    return row(
      isRent ? '🏠' : '🏦',
      label,
      `${isRent ? 'Rent' : 'Mortgage'} due · ${formatMoney(r.amount, r.currency)}`,
      h('span', { class: `pill ${s.cls}` }, s.label),
      () => navigate('rent'),
      [remindButton(`${label} is ${s.label.toLowerCase()}`)],
    );
  });

  const upcomingEvents = soonEvents.map((e) => row(
    CATEGORY_ICONS[e.category] || '📌',
    e.title,
    e.recurring ? `${formatDate(e._next)} · ${e.recurring_interval}` : formatDate(e._next),
    h('div', { style: 'display:flex;gap:6px;align-items:center' }, [
      e.category ? h('span', { class: `pill ${gradientClass(e.id)}` }, e.category) : null,
      h('span', { class: 'pill upcoming' }, `In ${daysUntil(e._next)} day${daysUntil(e._next) === 1 ? '' : 's'}`),
    ]),
    () => navigate('events'),
  ));

  const upcomingGoals = goalsWithDates.map((g) => {
    const days = daysUntil(g.target_date);
    const label = days === 0 ? "It's today!" : `${days}d to go`;
    return row('🎯', g.title, formatDate(g.target_date), h('span', { class: 'pill upcoming' }, label), () => navigate('goals'));
  });

  // The expense balance already exists on Money → Expenses
  // (balance.js/computeBalance), but it's buried two taps deep from the
  // screen people actually open daily — surface it here too, same banner
  // style, tapping through to settle up.
  const balanceBanner = balance && !balance.settled
    ? h('div', { class: 'total-banner', onclick: () => navigate('expenses'), style: 'cursor:pointer' }, [
        h('span', {}, `${memberName(balance.owedBy)} owes ${memberName(balance.owedTo)}`),
        h('span', { class: 'value' }, formatMoney(balance.amount, ctx.household.default_currency || 'AUD')),
      ])
    : null;

  // A quick glance at the two checklist-shaped segments that otherwise
  // have no presence on the home dashboard at all — just a count and a
  // tap-through, not a duplicate of their own lists.
  const onYourPlate = (groceryToBuyCount > 0 || activeTodoCount > 0)
    ? h('div', {}, [
        h('div', { class: 'section-title' }, 'On your plate'),
        groceryToBuyCount > 0 ? row('🛒', 'Grocery list', `${groceryToBuyCount} item${groceryToBuyCount === 1 ? '' : 's'} to buy`, null, () => navigate('groceries')) : null,
        activeTodoCount > 0 ? row('📝', 'Your to-dos', `${activeTodoCount} active reminder${activeTodoCount === 1 ? '' : 's'}`, null, () => navigate('todos')) : null,
      ])
    : null;

  mount(container, [
    stickyNote(ctx),
    balanceBanner,

    h('div', { class: 'section-title' }, "What's due"),
    ...(dueItems.length ? dueItems : [h('div', { class: 'empty-state' }, [h('div', { class: 'glow-check' }, '✓'), 'All caught up!'])]),

    h('div', { class: 'section-title' }, 'Upcoming events'),
    ...(upcomingEvents.length ? upcomingEvents : [h('div', { class: 'empty-state' }, 'No upcoming events.')]),

    h('div', { class: 'section-title' }, 'Upcoming goals'),
    ...(upcomingGoals.length ? upcomingGoals : [h('div', { class: 'empty-state' }, 'No goals with a target date coming up.')]),

    onYourPlate,
  ]);
}
