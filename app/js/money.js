import { h, mount } from './dom.js';

const SUB_TABS = [
  { key: 'expenses', label: 'Expenses', mod: () => import('./expenses.js') },
  { key: 'rent', label: 'BrackenRidge Rent', mod: () => import('./rent.js') },
  { key: 'groceries', label: 'Grocery List', mod: () => import('./grocery.js') },
  { key: 'recipes', label: 'Recipes', mod: () => import('./recipes.js') },
];

let activeSub = 'expenses';

export async function render(container, ctx) {
  const subNav = h('div', { class: 'segmented' }, SUB_TABS.map((t) =>
    h('button', {
      class: t.key === activeSub ? 'active' : '',
      type: 'button',
      onclick: () => { activeSub = t.key; render(container, ctx); },
    }, t.label)
  ));
  const content = h('div', {}, h('div', { class: 'empty-state' }, 'Loading…'));
  mount(container, [subNav, content]);

  const tab = SUB_TABS.find((t) => t.key === activeSub);
  const mod = await tab.mod();
  try {
    await mod.render(content, ctx);
  } catch (err) {
    mount(content, h('div', { class: 'empty-state' }, `Something went wrong: ${err.message}`));
  }
}

export function setActiveSub(key) {
  if (SUB_TABS.some((t) => t.key === key)) activeSub = key;
}
