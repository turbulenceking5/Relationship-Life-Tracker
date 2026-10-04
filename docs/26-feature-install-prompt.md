# Feature: Pre-signup "Add to Home Screen" interstitial

## Purpose
Before this, a brand-new visitor who followed a link straight into a
browser tab would sign up, use the app for a while in that tab, and
only later discover (from the account sheet's push-notifications
section, or just by it quietly not working) that due-date reminders and
offline access require the app to actually be installed to the Home
Screen — a confusing gap between "I have an account" and "this actually
works like an app." `app/js/installPrompt.js` + `renderInstallInterstitial()`
in `app/js/app.js` close that gap by offering the install step **before**
sign-up/log-in even loads, not after.

## Why this needs its own module, not just reusing the account sheet's message
`app/js/app.js`'s `renderNotificationsSection()` already has a line
telling a non-standalone user to install the app — but that's buried in
settings, shown only after signing up, and purely informational (no
install action, since that section was only ever about push). This
feature needs to actually *act*: capture Chromium's native install
prompt event and offer a real "Install app" button, or show the manual
iOS instructions, before the user has any account yet.

## The three paths
1. **Chromium-based browsers that support `beforeinstallprompt`**
   (Android Chrome, desktop Chrome/Edge): the event is captured at
   module load (`installPrompt.js`'s top-level listener — this has to
   run as early as possible, since the event only fires once and isn't
   re-dispatchable), and the interstitial shows a real "Install app"
   button wired to `triggerInstall()`.
2. **iOS Safari**: `beforeinstallprompt` doesn't exist on iOS at all —
   there's no API to trigger or even detect installability, only the
   manual Share → "Add to Home Screen" path. Detected via a plain
   `navigator.userAgent` check (`isIos()`), since there's no better
   signal available.
3. **Everything else** (desktop Firefox, any browser with neither):
   nothing actionable to offer, so `shouldShowInstallPrompt()` returns
   `false` and the interstitial is skipped entirely — showing a
   dead-end screen with no real action would be worse than not showing
   one at all.

## Why `shouldShowInstallPrompt()` is async and waits up to 500ms
`beforeinstallprompt` fires on the browser's own installability
timeline, not synchronously at page load — in testing this surfaced as
a genuine race: `boot()`'s decision runs right after the near-instant
`getSession()` call, which resolves on the very next microtask, almost
always before the event has had any chance to fire. Without waiting,
the native "Install app" path would be permanently unreachable on every
Chromium browser, falling through to the plain auth screen every time.
`waitForDeferredEvent(500)` resolves as soon as the event fires, or
after 500ms either way, so the check only ever actually delays on an
**actual first-ever cold boot** on a non-iOS browser — the seen-flag is
checked first, so a returning browser (already dismissed, or already
standalone) never pays that wait, and iOS never needs to wait for an
event it'll never get.

## Seen-once, not permanent
Same `localStorage` tolerance pattern as `onboarding.js`/`changelog.js`/
the push-notification prompt: shown once per browser
(`installPromptSeen`), whether the user installs, uses the native
prompt and dismisses it, or taps "Continue in browser" — none of those
outcomes are worth asking about again. A cleared browser or private
window just re-shows it once, a harmless degradation.

## Not done (possible follow-ups)
- No re-prompt if the user dismisses the native install prompt once but
  might reconsider later — same reasoning as every other seen-once
  dialog in this app (onboarding, changelog, push).
- Android/Chromium's own "mini-infobar"/omnibox install icon still
  appears independently of this interstitial — this doesn't suppress or
  coordinate with it, since `preventDefault()` on `beforeinstallprompt`
  already does that natively.
