// Pre-signup "Add to Home Screen" interstitial — see
// docs/26-feature-install-prompt.md for why this needs to run before
// auth at all, not just nudge about it afterward like the account
// sheet's existing "Install this app..." line for push notifications.
//
// `beforeinstallprompt` only fires on Chromium-based browsers (Android
// Chrome, desktop Chrome/Edge) and only if the browser decides the page
// is installable — there's no way to request it on demand, so the
// listener has to be registered at module load (this file is imported
// near the top of app.js) to have any chance of catching it before
// boot() checks canPromptInstall(). iOS Safari never fires it at all;
// there's no API for "trigger the install prompt" there, only the
// manual Share → Add to Home Screen path, which is why isIos() exists
// as a separate code path below rather than one relying on the event.
let deferredEvent = null;
let waiters = [];
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredEvent = e;
  waiters.forEach((resolve) => resolve());
  waiters = [];
});

// The event fires on the browser's own installability timeline, not
// synchronously at page load — often well after this module has already
// run. Without waiting for it, boot()'s decision (made right after the
// near-instant getSession() call) would almost always run before the
// event has had a chance to fire, permanently missing the native
// install prompt on every Chromium browser. Resolves immediately if the
// event already fired, or after `timeoutMs` either way.
function waitForDeferredEvent(timeoutMs) {
  if (deferredEvent) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    setTimeout(resolve, timeoutMs);
  });
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function canPromptInstall() {
  return Boolean(deferredEvent);
}

// Resolves once the user responds to the native install prompt —
// 'accepted' | 'dismissed' | 'unavailable' (if the event was never
// captured, e.g. already used or this isn't a Chromium browser).
export async function triggerInstall() {
  if (!deferredEvent) return 'unavailable';
  deferredEvent.prompt();
  const choice = await deferredEvent.userChoice;
  deferredEvent = null;
  return choice.outcome;
}

const SEEN_KEY = 'installPromptSeen';

// Shown once per browser (same seen-once tolerance pattern as
// onboarding.js/changelog.js/notifications.js's push prompt), and only
// when there's actually something to offer: either a native install
// prompt is available, or this is iOS Safari where the manual
// instructions are the only path. A browser with neither (e.g. desktop
// Firefox) has nothing actionable to show, so this returns false rather
// than displaying a dead-end screen.
//
// Checks the seen-flag *before* waiting on waitForDeferredEvent(), so a
// returning browser (already dismissed, or already standalone) never
// pays that wait — it only ever applies on an actual first-ever cold
// boot for a non-iOS browser that might support the native prompt.
export async function shouldShowInstallPrompt(isStandalone) {
  if (isStandalone) return false;
  try {
    if (localStorage.getItem(SEEN_KEY) === '1') return false;
  } catch {
    // Storage unavailable — fall through and treat as unseen, same
    // tolerance as everywhere else this pattern is used.
  }
  if (!isIos()) await waitForDeferredEvent(500);
  return isIos() || canPromptInstall();
}

export function markInstallPromptSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch {
    // Won't persist across reloads — the interstitial just reappears
    // next time, a harmless (if mildly repetitive) failure mode.
  }
}
