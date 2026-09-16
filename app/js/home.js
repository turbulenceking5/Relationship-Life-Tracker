import { h, mount } from './dom.js';
import { fetchRows } from './crud.js';
import { formatDate, formatMoney, dueStatus, todayStr } from './format.js';

export async function render(container, ctx, navigate) {
  const [events, replacements, repayments] = await Promise.all([
    fetchRows('events', ctx.household.id, 'event_date', true),
    fetchRows('replacement_items', ctx.household.id, 'next_due_date', true),
    fetchRows('repayments', ctx.household.id, 'due_date', true),
  ]);

  const today = todayStr();
  const soonEvents = events.filter((e) => e.event_date >= today).slice(0, 3);
  const dueReplacements = replacements.filter((r) => dueStatus(r.next_due_date).cls !== 'ok').slice(0, 5);
  const dueRepayments = repayments.filter((r) => r.status === 'active' && r.due_date && dueStatus(r.due_date).cls !== 'ok').slice(0, 5);

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
    ...dueRepayments.map((r) => {
      const s = dueStatus(r.due_date);
      return row(r.title, `Repayment · ${formatMoney(r.remaining_amount, r.currency)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('repayments'));
    }),
  ];

  mount(container, [
    h('div', { class: 'section-title' }, "What's due"),
    ...(dueItems.length ? dueItems : [h('div', { class: 'empty-state' }, "Nothing due soon — you're on top of things.")]),

    h('div', { class: 'section-title' }, 'Coming up'),
    ...(soonEvents.length
      ? soonEvents.map((e) => row(e.title, formatDate(e.event_date), h('span', { class: 'pill' }, e.category || ''), () => navigate('events')))
      : [h('div', { class: 'empty-state' }, 'No upcoming events.')]),
  ]);
}
