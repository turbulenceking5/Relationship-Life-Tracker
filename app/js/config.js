// Supabase project config for Relationship Life Tracker.
// The publishable/anon key below is safe to ship in client-side code —
// Row Level Security policies on the database are what actually gate
// access, not this key. See docs/09-setup-supabase.md.
export const SUPABASE_URL = 'https://crwsnztcnoyzviurkvbd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nTb2Mprx3HtQo63vqezDQQ_ePu9i7VC';

// Where the app is actually hosted — used to build absolute redirect URLs
// (e.g. where Supabase sends people after they click an email
// confirmation link). Update this if you deploy elsewhere.
export const SITE_URL = 'https://turbulenceking5.github.io/Relationship-Life-Tracker';

// VAPID public key for Web Push (see docs/11-push-notifications.md). Public
// keys are meant to be shared with the browser — only the matching private
// key (kept in Supabase Vault, never shipped here) can sign push messages.
export const VAPID_PUBLIC_KEY = 'BL2m2SQvD5IIaI60UbnxCipQU6rGZp6pVox4XrZ8jgEwZLblNZk6NfnVpa38zVaVPNnIx_aebN6GLMMkDT6dTDw';
