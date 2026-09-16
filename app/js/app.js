import { supabase } from './supabaseClient.js';
import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { renderAuthScreen } from './auth.js';
import { renderHouseholdScreen, getMyHousehold, renderInviteInfo } from './household.js';
import { isStandalone, isPushSupported, getSubscriptionStatus, enablePush, disablePush } from './notifications.js';

const appEl = document.getElementById('app');

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠', mod: () => import('./home.js') },
  { key: 'events', label: 'Events', icon: '📅', mod: () => import('./events.js') },
  { key: 'money', label: 'Money', icon: '💰', mod: () => import('./money.js') },
  { key: 'goals', label: 'Goals', icon: '🎯', mod: () => import('./goals.js') },
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
      await mod.render(main, ctx, async (key) => {
        if (key === 'expenses' || key === 'replacements' || key === 'repayments') {
          const moneyMod = await import('./money.js');
          moneyMod.setActiveSub(key);
          currentTab = 'money';
        } else {
          currentTab = key;
        }
        renderMainApp();
      });
    } else {
      await mod.render(main, ctx);
    }
  } catch (err) {
    main.innerHTML = '';
    main.appendChild(h('div', { class: 'empty-state' }, `Something went wrong: ${err.message}`));
  }
}

function showAccountSheet() {
  const { dialog, body } = makeSheet('Account & household');
  const notificationsSection = h('div', { class: 'meta' }, 'Checking notification status…');

  mount(body, [
    h('p', { class: 'meta' }, ctx.user.email),
    renderInviteInfo(ctx.household),
    h('div', { class: 'section-title' }, 'Notifications'),
    notificationsSection,
    h('button', {
      class: 'btn secondary',
      style: 'margin-top:16px',
      onclick: async () => { closeSheet(dialog); await supabase.auth.signOut(); },
    }, 'Sign out'),
  ]);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  openSheet(dialog);

  renderNotificationsSection(notificationsSection);
}

async function renderNotificationsSection(container) {
  if (!isPushSupported()) {
    mount(container, h('p', { class: 'meta' }, "Push notifications aren't supported in this browser."));
    return;
  }
  if (!isStandalone()) {
    mount(container, h('p', { class: 'meta' }, 'Install this app to your Home Screen (Share → Add to Home Screen) to enable due-date reminders.'));
    return;
  }

  let status;
  try {
    status = await getSubscriptionStatus(ctx);
  } catch (err) {
    mount(container, h('p', { class: 'error-msg' }, `Could not check notification status: ${err.message}`));
    return;
  }

  const draw = (currentStatus) => {
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const label = currentStatus === 'enabled' ? 'Turn off due-date reminders' : 'Turn on due-date reminders';
    const btn = h('button', {
      class: 'btn secondary',
      onclick: async () => {
        errorEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Please wait…';
        try {
          if (currentStatus === 'enabled') {
            await disablePush(ctx);
            draw('disabled');
          } else {
            await enablePush(ctx);
            draw('enabled');
          }
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = label;
        }
      },
    }, label);
    mount(container, [
      h('p', { class: 'meta' }, 'Get a push notification when a replacement item or repayment becomes due.'),
      btn,
      errorEl,
    ]);
  };
  draw(status);
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
