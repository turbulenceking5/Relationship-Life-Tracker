import { supabase } from './supabaseClient.js';
import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { renderAuthScreen } from './auth.js';
import { renderHouseholdScreen, getMyHousehold, renderInviteInfo, getHouseholdMembers, updateSplitPercents } from './household.js';
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
        if (key === 'expenses' || key === 'replacements' || key === 'rent') {
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
  const splitSection = h('div', { class: 'meta' }, 'Loading…');

  mount(body, [
    h('p', { class: 'meta' }, ctx.user.email),
    renderInviteInfo(ctx.household),
    h('div', { class: 'section-title' }, 'Expense split'),
    splitSection,
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
  renderSplitSection(splitSection);
}

async function renderSplitSection(container) {
  let members;
  try {
    members = await getHouseholdMembers(ctx.household.id);
  } catch (err) {
    mount(container, h('p', { class: 'error-msg' }, `Could not load members: ${err.message}`));
    return;
  }

  if (members.length !== 2) {
    mount(container, h('p', { class: 'meta' }, 'Invite your partner to set how shared expenses are split — this needs exactly two household members.'));
    return;
  }

  const [a, b] = members;
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const successEl = h('div', { class: 'success-msg', style: 'display:none' });
  const percentA = h('input', { type: 'number', min: '0', max: '100', step: '1', value: a.split_percent });
  const percentB = h('input', { type: 'number', min: '0', max: '100', step: '1', value: b.split_percent, disabled: true });

  percentA.addEventListener('input', () => {
    const val = Math.max(0, Math.min(100, parseFloat(percentA.value) || 0));
    percentB.value = Math.round((100 - val) * 100) / 100;
  });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      successEl.style.display = 'none';
      const valA = parseFloat(percentA.value);
      if (!(valA >= 0 && valA <= 100)) {
        errorEl.textContent = 'Enter a percentage between 0 and 100.';
        errorEl.style.display = 'block';
        return;
      }
      try {
        await updateSplitPercents(ctx.household.id, a.user_id, valA, b.user_id, 100 - valA);
        successEl.textContent = 'Split saved.';
        successEl.style.display = 'block';
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, a.display_name), percentA]),
      h('div', { class: 'field' }, [h('label', {}, `${b.display_name} (auto)`), percentB]),
    ]),
    errorEl,
    successEl,
    h('button', { class: 'btn secondary small', type: 'submit' }, 'Save split'),
  ]);

  mount(container, [
    h('p', { class: 'meta' }, 'What share of shared expenses each of you is responsible for — used for the "who owes who" balance on the Expenses tab.'),
    form,
  ]);
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
      h('p', { class: 'meta' }, 'Get a push notification when a replacement item becomes due.'),
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
