import { supabase } from './supabaseClient.js';
import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { renderAuthScreen } from './auth.js';
import { renderHouseholdScreen, getMyHousehold, renderInviteInfo, getHouseholdMembers, updateSplitPercents } from './household.js';
import { isStandalone, isPushSupported, getSubscriptionStatus, enablePush, disablePush } from './notifications.js';
import { getTheme, setTheme } from './theme.js';
import { getUnseenEntries, markChangelogSeen } from './changelog.js';
import { shouldShowOnboarding, markOnboardingSeen } from './onboarding.js';
import { formatDate } from './format.js';
import {
  isConfigured as isDriveConfigured,
  isDriveConnected,
  hasLocalDriveAccess,
  folderUrl,
  connectAsFirstPartner,
  connectAsSecondPartner,
  shareFolderWithEmail,
} from './googleDrive.js';
import { subscribeHousehold, unsubscribeHousehold } from './realtime.js';

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
let mainEl = null;
let realtimeChannel = null;
let refreshTimer = null;

// A partner's change to a shared table re-renders the current tab so it
// shows up without a manual reload — the whole point of a two-person
// household sharing one data set. Debounced so a burst of changes (e.g.
// recurring expenses logging several rows at once) triggers one
// re-render, not one per row. Skipped while someone's actively typing in
// an inline field (a search box — every add/edit form is a `<dialog>`
// appended to `document.body`, outside `main`, so this never interrupts
// filling one out) so a live update can't yank typed text out from
// under them; the next own action picks up the change anyway.
function scheduleRefresh(table, payload) {
  if (table === 'households' && payload?.new) {
    Object.assign(ctx.household, payload.new);
  }
  const active = document.activeElement;
  if (mainEl && active && mainEl.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    return;
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => renderMainApp(), 400);
}

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
  showOnboardingIfNeeded(showChangelogIfUnseen);
  realtimeChannel = subscribeHousehold(household.id, scheduleRefresh);
}

// Shown once ever per browser, before the changelog dialog (chained via
// its close handler so only one dialog is ever open at a time) — a brief
// orientation for someone who's just created or joined a household and
// has no idea what the five tabs are or where the invite code lives.
function showOnboardingIfNeeded(onDone) {
  if (!shouldShowOnboarding()) {
    onDone();
    return;
  }

  const { dialog, body } = makeSheet('Welcome');
  mount(body, [
    h('p', {}, `Everything you add here is shared with your partner once they've joined "${ctx.household.name}" — one source of truth instead of split notes and group chats.`),
    h('div', { class: 'section-title' }, 'Where things live'),
    h('ul', { class: 'recipe-list' }, [
      h('li', {}, [h('strong', {}, 'Home'), ' — what needs attention today: due bills, upcoming events and goals.']),
      h('li', {}, [h('strong', {}, 'Events'), ' — birthdays, anniversaries, appointments.']),
      h('li', {}, [h('strong', {}, 'Money'), ' — expenses, BrackenRidge rent/mortgage, groceries, recipes, and your private to-dos.']),
      h('li', {}, [h('strong', {}, 'Goals'), ' — savings/spending trackers with their own tasks and documents.']),
      h('li', {}, [h('strong', {}, 'Docs'), ' — warranties, contracts and receipts.']),
    ]),
    h('p', { class: 'meta' }, 'Invite your partner any time from ⚙️ Account & household — your invite code is there.'),
    h('button', { class: 'btn primary', onclick: () => closeSheet(dialog) }, 'Got it'),
  ]);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => { markOnboardingSeen(); dialog.remove(); onDone(); });
  openSheet(dialog);
}

// Runs once per app load (from afterAuth, not from every tab switch or
// account-sheet open) so "What's new" reflects what changed since this
// browser last saw it, not since the current session started.
function showChangelogIfUnseen() {
  const unseen = getUnseenEntries();
  if (!unseen.length) return;

  const { dialog, body } = makeSheet("What's new");
  mount(body, [
    ...unseen.flatMap((entry) => [
      h('div', { class: 'section-title' }, `${entry.title} · ${formatDate(entry.date)}`),
      h('ul', { class: 'recipe-list' }, entry.items.map((item) => h('li', {}, item))),
    ]),
    h('button', { class: 'btn primary', onclick: () => closeSheet(dialog) }, 'Got it'),
  ]);
  document.body.appendChild(dialog);
  // Any way of closing (this button, the sheet's own ✕, tap-outside)
  // counts as "seen" — someone dismissing via the ✕ isn't asking to be
  // reminded later.
  dialog.addEventListener('close', () => { markChangelogSeen(); dialog.remove(); });
  openSheet(dialog);
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

  mainEl = main;
  mount(appEl, [topbar, main, tabbar]);

  const tab = TABS.find((t) => t.key === currentTab);
  const mod = await tab.mod();
  main.innerHTML = '';
  const loading = h('div', { class: 'empty-state' }, 'Loading…');
  main.appendChild(loading);
  try {
    if (tab.key === 'home') {
      await mod.render(main, ctx, async (key) => {
        if (key === 'expenses' || key === 'rent' || key === 'groceries' || key === 'todos') {
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
  const driveSection = h('div', {});

  mount(body, [
    h('p', { class: 'meta' }, ctx.user.email),
    renderInviteInfo(ctx.household),
    h('div', { class: 'section-title' }, 'Theme'),
    renderThemeToggle(),
    h('div', { class: 'section-title' }, 'Expense split'),
    splitSection,
    h('div', { class: 'section-title' }, 'Documents storage'),
    driveSection,
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
  renderDriveSection(driveSection);
}

// Documents now live in a shared Google Drive folder rather than
// Supabase Storage — see docs/21-google-drive-documents.md for why, and
// for why the "second partner" case needs a Picker step rather than just
// working off the first partner's share.
function renderDriveSection(container) {
  function draw() {
    if (!isDriveConfigured()) {
      mount(container, h('p', { class: 'meta' }, 'Google Drive isn’t set up for this deployment yet (needs a Google Cloud project — see docs/21-google-drive-documents.md).'));
      return;
    }

    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const runConnect = (fn, busyLabel) => async () => {
      errorEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = busyLabel;
      try {
        await fn();
        draw();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        btn.disabled = false;
      }
    };

    let btn;
    let rows;
    if (!isDriveConnected(ctx.household)) {
      const emailInput = h('input', { type: 'email', placeholder: "Partner's Google account email (optional)" });
      btn = h('button', {
        class: 'btn secondary',
        onclick: runConnect(async () => {
          await connectAsFirstPartner(ctx);
          if (emailInput.value.trim()) await shareFolderWithEmail(ctx, emailInput.value.trim());
        }, 'Connecting…'),
      }, 'Connect Google Drive');
      rows = [
        h('p', { class: 'meta' }, 'Connect a Google account to store uploaded documents there instead of on this server. Creates one shared folder both of you upload into.'),
        h('div', { class: 'field' }, emailInput),
        btn,
      ];
    } else if (hasLocalDriveAccess(ctx)) {
      rows = [
        h('p', { class: 'meta' }, `Connected — documents are stored in "${ctx.household.drive_folder_name}" in Google Drive.`),
        h('a', { class: 'btn secondary small', href: folderUrl(ctx.household), target: '_blank', rel: 'noopener' }, 'Open folder in Drive'),
      ];
    } else {
      btn = h('button', {
        class: 'btn secondary',
        onclick: runConnect(() => connectAsSecondPartner(ctx), 'Connecting…'),
      }, 'Grant my account access');
      rows = [
        h('p', { class: 'meta' }, `Your partner connected "${ctx.household.drive_folder_name}" in Google Drive. Select it below (it should show under "Shared with me") to grant your own account access too.`),
        btn,
      ];
    }
    mount(container, [...rows, errorEl]);
  }
  draw();
}

function renderThemeToggle() {
  const options = [
    { key: 'auto', label: 'Auto' },
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
  ];
  const container = h('div', { class: 'segmented' });

  function draw() {
    const current = getTheme();
    mount(container, options.map((o) => h('button', {
      type: 'button',
      class: o.key === current ? 'active' : '',
      onclick: () => { setTheme(o.key); draw(); },
    }, o.label)));
  }
  draw();

  return container;
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
      h('p', { class: 'meta' }, "Get a push notification for due dates. Nothing's wired up to trigger one right now."),
      btn,
      errorEl,
    ]);
  };
  draw(status);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    unsubscribeHousehold(realtimeChannel);
    realtimeChannel = null;
    ctx = null;
    currentTab = 'home';
    mount(appEl, wrapScreen((el) => renderAuthScreen(el)));
  } else if (event === 'SIGNED_IN' && !ctx) {
    afterAuth(session.user);
  }
});

boot();
