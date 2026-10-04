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
  {
    id: 4,
    date: '2026-09-28',
    title: 'Home tab: events and goals split apart',
    items: [
      'The "Coming up" feed is now two sections, "Upcoming events" and "Upcoming goals", instead of one mixed list',
    ],
  },
  {
    id: 5,
    date: '2026-09-28',
    title: 'Search, document expiry alerts, and a smarter What\'s due',
    items: [
      'Search boxes added to Expenses and Documents',
      'A document with an expiry date now shows a status badge, and shows up on the home dashboard once it\'s expiring soon or overdue',
      '"What\'s due" now shows rent, mortgage, and expiring documents together sorted by date, instead of grouped by type',
    ],
  },
  {
    id: 6,
    date: '2026-09-28',
    title: 'Push notifications actually notify now',
    items: [
      'Rent, mortgage, goal target dates, expired documents, and same-day events now send a real push notification, not just a log entry you had to open the app to see',
      'Rent, mortgage, goals, and documents notify again daily while overdue; goals stop once fully saved',
    ],
  },
  {
    id: 7,
    date: '2026-09-28',
    title: 'Recurring expenses',
    items: [
      'New "Recurring expenses" section on the Expenses tab for subscriptions, insurance, or anything else that repeats — set it once and it logs itself each period',
      'Pause a subscription without losing its history, or delete it outright',
    ],
  },
  {
    id: 8,
    date: '2026-09-28',
    title: 'Change the split on individual expenses',
    items: [
      'Any expense can now use a different split than your usual one — defaults to your account setting, change it only for that one expense',
    ],
  },
  {
    id: 9,
    date: '2026-09-28',
    title: 'Monthly spend total + category breakdown',
    items: [
      'A "This month" card on Expenses shows your total spend and a breakdown by category',
    ],
  },
  {
    id: 10,
    date: '2026-09-30',
    title: 'Repeatable events: weekly, fortnightly, monthly, yearly',
    items: [
      'Recurring events were yearly only — the add/edit form now offers weekly, fortnightly, and monthly too',
      'Good for a standing appointment or chore reminder, not just birthdays and anniversaries',
    ],
  },
  {
    id: 11,
    date: '2026-09-30',
    title: 'Personal to-dos — a reminder list just for you',
    items: [
      'New "My To-dos" segment on the Money tab, invisible to your partner',
      'Push notifications for a due reminder go only to your own devices',
    ],
  },
  {
    id: 12,
    date: '2026-09-30',
    title: 'Documents move to Google Drive — any file, not just photos',
    items: [
      'Uploading a document no longer opens the camera by default — pick any file type (PDFs, Word docs, spreadsheets, photos), not just images',
      'New uploads are stored in a shared Google Drive folder instead of on this app’s own server — connect it from ⚙️ Account & household',
      'Documents already uploaded before this change keep working exactly as before',
    ],
  },
  {
    id: 13,
    date: '2026-09-30',
    title: 'Document category filter chips',
    items: [
      'New filter chips (All/Warranty/Contract/Receipt/ID/Other) on the Docs tab, alongside search',
      'New Drive uploads are also prefixed with their category (e.g. "[Warranty] Boiler warranty.pdf") if you ever browse the shared folder directly in Drive',
    ],
  },
  {
    id: 14,
    date: '2026-10-01',
    title: 'New document category: Sophie',
    items: [
      'Added as a document category — shows up when adding/editing a document and in the filter chips',
    ],
  },
  {
    id: 15,
    date: '2026-10-01',
    title: 'Safer deletes, a fuller Home tab, and quicker expense entry',
    items: [
      'Every "Delete" button now asks you to confirm first, everywhere in the app',
      'Home now shows your expense balance and a quick glance at the Grocery List and My To-dos',
      'Adding an expense remembers your last category and brings up a number pad on iOS',
      'Expenses are grouped by month, with older months collapsed out of the way',
      'A quick "Welcome" tour appears the first time you open the app',
    ],
  },
  {
    id: 16,
    date: '2026-10-01',
    title: 'Mark events as done',
    items: [
      'Any event can now be marked done by hand, whether or not its date has passed yet',
      'A recurring event’s "done" status is tied to its current occurrence, so it automatically resets once the next one comes around',
    ],
  },
  {
    id: 17,
    date: '2026-10-01',
    title: 'Grocery list categories',
    items: [
      'Grocery items now get a category (Produce, Meat, Dairy, Bakery, Frozen, Pantry, Household, Other)',
      'The "To buy" list is grouped into sections by category, in shop-aisle order',
    ],
  },
  {
    id: 18,
    date: '2026-10-01',
    title: 'Grocery items categorize themselves',
    items: [
      'Typing a grocery item now guesses its category automatically — "Milk" picks Dairy, "Chicken" picks Meat, and so on',
      'Anything not recognized falls back to Other, with the category dropdown always there to pick the right one by hand',
    ],
  },
  {
    id: 19,
    date: '2026-10-02',
    title: 'My To-dos reminders now fire at the right time',
    items: [
      'A reminder set for a specific time (e.g. 6:30am) now notifies then, not just whenever the once-daily check happened to run',
    ],
  },
  {
    id: 20,
    date: '2026-10-02',
    title: 'Grocery items can now be edited, and recipes can fill your list',
    items: [
      'Grocery items can now be edited (title, quantity, category) instead of delete-and-re-add, and the list gets its own search box',
      'A new "Add ingredients to Grocery List" button on any recipe pushes its ingredients straight onto your To Buy list, auto-categorized',
      'A repeating My To-dos reminder marked done by hand now correctly moves to its next occurrence instead of disappearing for good',
      'Expense, grocery, and event cards now show who added them when that differs from who’s otherwise shown',
      'Every "Save" button now shows a brief "Saving…" state so a slow connection can’t cause a double-submit',
    ],
  },
  {
    id: 21,
    date: '2026-10-02',
    title: 'Shared note, event-goal links, chore rotation, and goal celebrations',
    items: [
      'A shared sticky note on Home for quick messages to each other — "grabbed milk already", that sort of thing',
      'A recurring event can now alternate between the two of you each occurrence (e.g. bin day) instead of always showing the same person',
      'An event can be linked to a goal, showing up on its card (e.g. "Anniversary dinner" linked to your Wedding Fund)',
      'Reaching a savings goal now gets a one-time confetti celebration',
      'Rent/mortgage shows a quiet "paid on time N periods running" streak once you\'ve built one up',
    ],
  },
  {
    id: 22,
    date: '2026-10-02',
    title: 'Live sync, remind-your-partner, and a weekly digest',
    items: [
      'A change either of you makes — adding an expense, ticking off a grocery item, logging rent as paid — now shows up on the other person\'s phone automatically, no reload needed',
      'A "🔔 Remind" button on any overdue item in "What\'s due" sends your partner a one-tap push nudge instead of texting them separately',
      'A weekly push recaps the week — total spent, total saved toward goals, and what\'s coming up — sent once, every Sunday evening',
    ],
  },
  {
    id: 23,
    date: '2026-10-02',
    title: 'Finish or close a goal',
    items: [
      'A goal can now be marked finished — useful once you\'ve hit the target, or for a plain checklist-style goal with no target amount that was never going to "complete" on its own',
      'Finished goals move into a collapsed "Closed goals" section at the bottom of the tab, and can be reopened any time',
    ],
  },
  {
    id: 24,
    date: '2026-10-04',
    title: 'Bug fixes: the partner-remind nudge, live sync, and search',
    items: [
      'Fixed the "🔔 Remind" nudge not actually working in most browsers',
      'A partner\'s live update no longer interrupts you mid-edit on a goal or recipe, or collapses a section you had open',
      'Added search boxes to Events and My To-dos, matching every other list',
      'Documents now show who added them, like every other card type',
    ],
  },
  {
    id: 25,
    date: '2026-10-04',
    title: 'The app now asks if you want notifications',
    items: [
      'If you haven\'t turned on push notifications yet, the app now asks once — "Enable notifications" or "Not now"',
      'Say "Not now" and it won\'t ask again, but you can still turn it on any time from ⚙️ Account & household',
    ],
  },
  {
    id: 26,
    date: '2026-10-04',
    title: 'Leave a household, or remove a member',
    items: [
      'A new "Household members" section in ⚙️ Account & household lets you leave the household',
      'Whoever created the household can also remove the other member — useful if you split up and want to cut off their access',
    ],
  },
  {
    id: 27,
    date: '2026-10-04',
    title: 'Log a personal expense without splitting it',
    items: [
      'A new "Personal expense" checkbox on Add/Edit expense excludes it from the shared balance entirely',
      'Useful for a gift or purely personal purchase you still want tracked — no need for a 100/0 split to fake it',
    ],
  },
  {
    id: 28,
    date: '2026-10-04',
    title: 'Comment on an expense or event',
    items: [
      'A new 💬 button on any expense or event opens a comment thread for back-and-forth notes — "did we ever get reimbursed for this?", "who\'s picking up the cake?"',
      'Either partner can post or delete a comment',
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
