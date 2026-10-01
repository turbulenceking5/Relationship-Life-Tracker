// One-time "welcome" dialog shown on a browser's very first app load —
// see docs/14-ui-patterns.md and the changelog's seen-tracking pattern in
// changelog.js, which this mirrors (a single localStorage flag rather
// than a per-entry id, since there's only ever one onboarding dialog).
const KEY = 'onboardingSeen';

export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    // Storage unavailable — treat as unseen rather than never showing it,
    // same tolerance as changelog.js.
    return true;
  }
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Won't persist across reloads — the dialog just reappears next time,
    // a harmless (if mildly repetitive) failure mode.
  }
}
