import { h, mount } from './dom.js';
import { fetchRows } from './crud.js';
import { formatDate, formatMoney, dueStatus, daysUntil, todayStr, nextOccurrence } from './format.js';

const CATEGORY_ICONS = { birthday: '🎂', anniversary: '💍', appointment: '📅', other: '📌' };
const GRADIENT_CLASSES = ['grad-a', 'grad-b', 'grad-c', 'grad-d', 'grad-e'];

function gradientClass(seed) {
  let hash = 0;
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENT_CLASSES[hash % GRADIENT_CLASSES.length];
}

export async function render(container, ctx, navigate) {
  const [events, rentPayments, goals] = await Promise.all([
    fetchRows('events', ctx.household.id, 'event_date', true),
    fetchRows('rent_payments', ctx.household.id, 'due_date', true),
    fetchRows('custom_goals', ctx.household.id, 'target_date', true),
  ]);

  const today = todayStr();
  const soonEvents = events
    .map((e) => ({ ...e, _next: nextOccurrence(e.event_date, e.recurring) }))
    .filter((e) => e._next >= today)
    .sort((a, b) => (a._next < b._next ? -1 : 1))
    .slice(0, 3);
  const dueRent = rentPayments.filter((r) => !r.paid && dueStatus(r.due_date).cls !== 'ok').slice(0, 5);
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

  const dueItems = [
    ...dueRent.map((r) => {
      const s = dueStatus(r.due_date);
      return row('🏠', r.property_label || 'BrackenRidge Rent', `Rent due · ${formatMoney(r.amount, r.currency)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('rent'));
    }),
  ];

  const comingUp = [
    ...soonEvents.map((e) => row(
      CATEGORY_ICONS[e.category] || '📌',
      e.title,
      e.recurring ? `${formatDate(e._next)} · yearly` : formatDate(e._next),
      h('div', { style: 'display:flex;gap:6px;align-items:center' }, [
        e.category ? h('span', { class: `pill ${gradientClass(e.id)}` }, e.category) : null,
        h('span', { class: 'pill upcoming' }, `In ${daysUntil(e._next)} day${daysUntil(e._next) === 1 ? '' : 's'}`),
      ]),
      () => navigate('events'),
    )),
    ...goalsWithDates.map((g) => {
      const days = daysUntil(g.target_date);
      const label = days === 0 ? "It's today!" : `${days}d to go`;
      return row('🎯', g.title, formatDate(g.target_date), h('span', { class: 'pill upcoming' }, label), () => navigate('goals'));
    }),
  ];

  mount(container, [
    h('div', { class: 'section-title' }, "What's due"),
    ...(dueItems.length ? dueItems : [h('div', { class: 'empty-state' }, [h('div', { class: 'glow-check' }, '✓'), 'All caught up!'])]),

    h('div', { class: 'section-title' }, 'Coming up'),
    ...(comingUp.length ? comingUp : [h('div', { class: 'empty-state' }, 'No upcoming events.')]),
  ]);
}
