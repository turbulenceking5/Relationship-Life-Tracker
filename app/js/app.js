import { supabase } from './supabaseClient.js';
import { h, mount } from './dom.js';
import { renderAuthScreen } from './auth.js';
import { renderHouseholdScreen, getMyHousehold, renderInviteInfo } from './household.js';

const appEl = document.getElementById('app');

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠', mod: () => import('./home.js') },
  { key: 'events', label: 'Events', icon: '📅', mod: () => import('./events.js') },
  { key: 'expenses', label: 'Expenses', icon: '💷', mod: () => import('./expenses.js') },
  { key: 'replacements', label: 'Replace', icon: '🔧', mod: () => import('./replacements.js') },
  { key: 'repayments', label: 'Repay', icon: '🤝', mod: () => import('./repayments.js') },
  { key: 'documents', label: 'Docs', icon: '📄', mod: () => import('./documents.js') },
];

let currentTab = 'home';
let ctx = null; // { user, household }

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    mount(appEl, wrapScreen((el) => renderAuthScreen(el)));
    return;
  }
  await afterAuth(session.user);
}

async function afterAuth(user) {
  let household;
  try {
    household = await getMyHousehold();
  } catch (err) {
    mount(appEl, h('div', { class: 'empty-state' }, `Could not load your household: ${err.message}`));
    return;
  }

  if (!household) {
    mount(appEl, wrapScreen((el) => renderHouseholdScreen(el, () => afterAuth(user))));
    return;
  }

  ctx = { user, household };
  renderMainApp();
}

function wrapScreen(drawFn) {
  const el = h('div', {});
  drawFn(el);
  return el;
}

async function renderMainApp() {
  const main = h('main', {});
  const topbar = h('div', { class: 'topbar' }, [
    h('div', {}, [
      h('h1', {}, ctx.household.name),
      h('div', { class: 'subtitle' }, TABS.find((t) => t.key === currentTab)?.label || ''),
    ]),
    h('button', { class: 'icon-btn', onclick: showAccountSheet, 'aria-label': 'Account' }, '⚙️'),
  ]);

  const tabbar = h('div', { class: 'tabbar' }, TABS.map((t) =>
    h('button', {
      class: t.key === currentTab ? 'active' : '',
      onclick: () => { currentTab = t.key; renderMainApp(); },
    }, [h('span', { class: 'tab-icon' }, t.icon), h('span', {}, t.label)])
  ));

  mount(appEl, [topbar, main, tabbar]);

  const tab = TABS.find((t) => t.key === currentTab);
  const mod = await tab.mod();
  main.innerHTML = '';
  const loading = h('div', { class: 'empty-state' }, 'Loading…');
  main.appendChild(loading);
  try {
    if (tab.key === 'home') {
      await mod.render(main, ctx, (key) => { currentTab = key; renderMainApp(); });
    } else {
      await mod.render(main, ctx);
    }
  } catch (err) {
    main.innerHTML = '';
    main.appendChild(h('div', { class: 'empty-state' }, `Something went wrong: ${err.message}`));
  }
}

function showAccountSheet() {
  const dialog = h('dialog', {}, []);
  mount(dialog, h('div', { class: 'sheet' }, [
    h('h2', {}, 'Account & household'),
    h('p', { class: 'meta' }, ctx.user.email),
    renderInviteInfo(ctx.household),
    h('button', {
      class: 'btn secondary',
      style: 'margin-top:16px',
      onclick: async () => { dialog.remove(); await supabase.auth.signOut(); },
    }, 'Sign out'),
  ]));
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  if (typeof dialog.showModal === 'function') dialog.showModal();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    ctx = null;
    currentTab = 'home';
    mount(appEl, wrapScreen((el) => renderAuthScreen(el)));
  } else if (event === 'SIGNED_IN' && !ctx) {
    afterAuth(session.user);
  }
});

boot();
