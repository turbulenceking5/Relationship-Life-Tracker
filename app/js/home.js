import { h, mount } from './dom.js';
import { fetchRows } from './crud.js';
import { formatDate, formatMoney, dueStatus, daysUntil, todayStr, nextOccurrence } from './format.js';

export async function render(container, ctx, navigate) {
  const [events, replacements, rentPayments, goals] = await Promise.all([
    fetchRows('events', ctx.household.id, 'event_date', true),
    fetchRows('replacement_items', ctx.household.id, 'next_due_date', true),
    fetchRows('rent_payments', ctx.household.id, 'due_date', true),
    fetchRows('custom_goals', ctx.household.id, 'target_date', true),
  ]);

  const today = todayStr();
  const soonEvents = events
    .map((e) => ({ ...e, _next: nextOccurrence(e.event_date, e.recurring) }))
    .filter((e) => e._next >= today)
    .sort((a, b) => (a._next < b._next ? -1 : 1))
    .slice(0, 3);
  const dueReplacements = replacements.filter((r) => dueStatus(r.next_due_date).cls !== 'ok').slice(0, 5);
  const dueRent = rentPayments.filter((r) => !r.paid && dueStatus(r.due_date).cls !== 'ok').slice(0, 5);
  const goalsWithDates = goals.filter((g) => g.target_date);

  function row(title, meta, pill, onClick) {
    return h('div', { class: 'card', onclick: onClick, style: onClick ? 'cursor:pointer' : '' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [h('h3', {}, title), h('div', { class: 'meta' }, meta)]),
        pill,
      ]),
    ]);
  }

  const dueItems = [
    ...dueReplacements.map((r) => {
      const s = dueStatus(r.next_due_date);
      return row(r.name, `Replacement · ${formatDate(r.next_due_date)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('replacements'));
    }),
    ...dueRent.map((r) => {
      const s = dueStatus(r.due_date);
      return row(r.property_label || 'Rent', `Rent due · ${formatMoney(r.amount, r.currency)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('rent'));
    }),
  ];

  const comingUp = [
    ...soonEvents.map((e) => row(e.title, e.recurring ? `${formatDate(e._next)} · yearly` : formatDate(e._next), h('span', { class: 'pill' }, e.category || ''), () => navigate('events'))),
    ...goalsWithDates.map((g) => {
      const days = daysUntil(g.target_date);
      const label = days === 0 ? "It's today!" : days > 0 ? `${days}d to go` : `${Math.abs(days)}d ago`;
      return row(g.title, formatDate(g.target_date), h('span', { class: 'pill' }, label), () => navigate('goals'));
    }),
  ];

  mount(container, [
    h('div', { class: 'section-title' }, "What's due"),
    ...(dueItems.length ? dueItems : [h('div', { class: 'empty-state' }, "Nothing due soon — you're on top of things.")]),

    h('div', { class: 'section-title' }, 'Coming up'),
    ...(comingUp.length ? comingUp : [h('div', { class: 'empty-state' }, 'No upcoming events.')]),
  ]);
}
