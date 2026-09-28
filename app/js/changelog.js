// Curated release notes shown in the "What's new" dialog on app load —
// see docs/18-feature-changelog.md. CHANGELOG.md at the repo root is the
// human-facing counterpart for anyone reading the repo (not loaded by
// the app); add an entry to both when shipping a user-facing change.
//
// `id` is a plain incrementing integer, not a semantic version — the
// only thing that matters is that a newer entry has a higher id than
// whatever's stored in localStorage, so "what's unseen" stays a single
// comparison. Never reuse or renumber an id once shipped.
export const CHANGELOG_ENTRIES = [
  {
    id: 1,
    date: '2026-09-16',
    title: 'Money tab, editing, and dark mode',
    items: [
      'Expenses, Rent and Goals reorganized into fewer tabs with a segmented sub-nav',
      'Every record type can now be edited, not just deleted and re-added',
      'Configurable expense split ("who owes who" balance) instead of a fixed 50/50',
      'Recurring yearly events for birthdays and anniversaries',
      'Dark mode gets its own neon "glow" visual treatment',
    ],
  },
  {
    id: 2,
    date: '2026-09-18',
    title: 'Grocery list, recipes, and a smarter Events tab',
    items: [
      'New Grocery List and Recipes segments in the Money tab',
      'Events split into "Upcoming" and "Done" for the current year',
      'The home dashboard drops past events and goals instead of showing them early with a misleading future date',
      'An in-app Light/Dark/Auto theme toggle, independent of your device setting',
    ],
  },
  {
    id: 3,
    date: '2026-09-28',
    title: 'Mortgage tracking, changelog, and a real expense-split fix',
    items: [
      'BrackenRidge now tracks the mortgage payment alongside rent',
      'Paid rent/mortgage history moved into a collapsed section at the bottom, out of the way',
      'Fixed the expense split silently never saving — changing it away from 50/50 actually sticks now',
      "This dialog — you'll see it here again whenever there's something new",
    ],
  },
];

const KEY = 'changelogLastSeenId';

// Newest first, since that's the only order this dialog ever displays in.
export function getUnseenEntries() {
  let lastSeen = 0;
  try {
    lastSeen = parseInt(localStorage.getItem(KEY), 10) || 0;
  } catch {
    // Storage unavailable — treat everything as unseen rather than
    // never showing the dialog at all.
  }
  return CHANGELOG_ENTRIES.filter((e) => e.id > lastSeen).sort((a, b) => b.id - a.id);
}

export function markChangelogSeen() {
  const latestId = CHANGELOG_ENTRIES.reduce((max, e) => Math.max(max, e.id), 0);
  try {
    localStorage.setItem(KEY, String(latestId));
  } catch {
    // Won't persist across reloads — the dialog just reappears next
    // time, a harmless (if mildly repetitive) failure mode.
  }
}
