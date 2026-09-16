import { h, mount } from './dom.js';
import { fetchRows } from './crud.js';
import { formatDate, formatMoney, dueStatus, daysUntil, todayStr } from './format.js';
import { supabase } from './supabaseClient.js';

export async function render(container, ctx, navigate) {
  const [events, replacements, repayments, rentPayments, weddingFund] = await Promise.all([
    fetchRows('events', ctx.household.id, 'event_date', true),
    fetchRows('replacement_items', ctx.household.id, 'next_due_date', true),
    fetchRows('repayments', ctx.household.id, 'due_date', true),
    fetchRows('rent_payments', ctx.household.id, 'due_date', true),
    supabase.from('wedding_fund').select('*').eq('household_id', ctx.household.id).maybeSingle().then(({ data }) => data),
  ]);

  const today = todayStr();
  const soonEvents = events.filter((e) => e.event_date >= today).slice(0, 3);
  const dueReplacements = replacements.filter((r) => dueStatus(r.next_due_date).cls !== 'ok').slice(0, 5);
  const dueRepayments = repayments.filter((r) => r.status === 'active' && r.due_date && dueStatus(r.due_date).cls !== 'ok').slice(0, 5);
  const dueRent = rentPayments.filter((r) => !r.paid && dueStatus(r.due_date).cls !== 'ok').slice(0, 5);

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
    ...dueRent.map((r) => {
      const s = dueStatus(r.due_date);
      return row(r.property_label || 'Rent', `Rent due · ${formatMoney(r.amount, r.currency)}`, h('span', { class: `pill ${s.cls}` }, s.label), () => navigate('goals'));
    }),
  ];

  const comingUp = [
    ...soonEvents.map((e) => row(e.title, formatDate(e.event_date), h('span', { class: 'pill' }, e.category || ''), () => navigate('events'))),
  ];
  if (weddingFund && weddingFund.wedding_date) {
    const days = daysUntil(weddingFund.wedding_date);
    const label = days === 0 ? "It's today!" : days > 0 ? `${days}d to go` : `${Math.abs(days)}d ago`;
    comingUp.push(row('Wedding', formatDate(weddingFund.wedding_date), h('span', { class: 'pill' }, label), () => navigate('goals')));
  }

  mount(container, [
    h('div', { class: 'section-title' }, "What's due"),
    ...(dueItems.length ? dueItems : [h('div', { class: 'empty-state' }, "Nothing due soon — you're on top of things.")]),

    h('div', { class: 'section-title' }, 'Coming up'),
    ...(comingUp.length ? comingUp : [h('div', { class: 'empty-state' }, 'No upcoming events.')]),
  ]);
}
