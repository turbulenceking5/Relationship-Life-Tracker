import { h, mount } from './dom.js';
import { fetchRows } from './crud.js';
import { formatDate, formatMoney, dueStatus, daysUntil, todayStr, thisYearOccurrence } from './format.js';
import { expiryStatus } from './documents.js';

const CATEGORY_ICONS = { birthday: '🎂', anniversary: '💍', appointment: '📅', other: '📌' };
const GRADIENT_CLASSES = ['grad-a', 'grad-b', 'grad-c', 'grad-d', 'grad-e'];

function gradientClass(seed) {
  let hash = 0;
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENT_CLASSES[hash % GRADIENT_CLASSES.length];
}

export async function render(container, ctx, navigate) {
  const [events, rentPayments, mortgagePayments, documents, goals] = await Promise.all([
    fetchRows('events', ctx.household.id, 'event_date', true),
    fetchRows('rent_payments', ctx.household.id, 'due_date', true),
    fetchRows('mortgage_payments', ctx.household.id, 'due_date', true),
    fetchRows('documents', ctx.household.id, 'expiry_date', true),
    fetchRows('custom_goals', ctx.household.id, 'target_date', true),
  ]);

  const today = todayStr();
  // thisYearOccurrence (not nextOccurrence) so a recurring event that's
  // already happened this year just drops off the dashboard instead of
  // reappearing early with next year's date — same "has it happened yet
  // this year" logic as the Events tab's Upcoming/Done split, just without
  // a Done section to move it into here.
  const soonEvents = events
    .map((e) => ({ ...e, _next: thisYearOccurrence(e.event_date, e.recurring) }))
    .filter((e) => e._next >= today)
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

  function row(icon, title, meta, pill, onClick) {
    return h('div', { class: 'card', onclick: onClick, style: onClick ? 'cursor:pointer' : '' }, [
      h('div', { class: 'card-row' }, [
        h('div', { style: 'display:flex;gap:10px;align-items:center' }, [
          icon ? h('div', { class: 'card-icon' }, icon) : null,
          h('div', {}, [h('h3', {}, title), h('div', { class: 'meta' }, meta)]),
        ]),
        pill,
      ]),
    ]);
  }

  const dueItems = dueItemsData.map((r) => {
    if (r._kind === 'document') {
      const s = expiryStatus(r._due);
      return row('📄', r.title, `Expires ${formatDate(r.expiry_date)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('documents'));
    }
    const s = dueStatus(r._due);
    const isRent = r._kind === 'rent';
    return row(
      isRent ? '🏠' : '🏦',
      r.property_label || (isRent ? 'BrackenRidge Rent' : 'BrackenRidge Mortgage'),
      `${isRent ? 'Rent' : 'Mortgage'} due · ${formatMoney(r.amount, r.currency)}`,
      h('span', { class: `pill ${s.cls}` }, s.label),
      () => navigate('rent'),
    );
  });

  const upcomingEvents = soonEvents.map((e) => row(
    CATEGORY_ICONS[e.category] || '📌',
    e.title,
    e.recurring ? `${formatDate(e._next)} · yearly` : formatDate(e._next),
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

  mount(container, [
    h('div', { class: 'section-title' }, "What's due"),
    ...(dueItems.length ? dueItems : [h('div', { class: 'empty-state' }, [h('div', { class: 'glow-check' }, '✓'), 'All caught up!'])]),

    h('div', { class: 'section-title' }, 'Upcoming events'),
    ...(upcomingEvents.length ? upcomingEvents : [h('div', { class: 'empty-state' }, 'No upcoming events.')]),

    h('div', { class: 'section-title' }, 'Upcoming goals'),
    ...(upcomingGoals.length ? upcomingGoals : [h('div', { class: 'empty-state' }, 'No goals with a target date coming up.')]),
  ]);
}
