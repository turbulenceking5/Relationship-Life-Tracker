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

// Google Drive document storage (see docs/21-google-drive-documents.md).
// Both values are client-side-safe identifiers (not secrets — Drive
// access is gated by the OAuth consent grant and Drive's own
// permissions, not by hiding these), but they only exist once the repo
// owner creates a Google Cloud project and fills these in — this is
// dashboard-only setup, same as the Supabase Auth settings noted in
// CLAUDE.md, and nobody else can do it on your behalf:
//   1. https://console.cloud.google.com/projectcreate — create a project.
//   2. APIs & Services → Library → enable "Google Drive API" and
//      "Google Picker API".
//   3. APIs & Services → OAuth consent screen → External, publishing
//      status "Testing", add both partners' Google accounts as test
//      users. (No Google verification review needed at this size.)
//   4. APIs & Services → Credentials → Create Credentials →
//      OAuth client ID → Web application → Authorized JavaScript
//      origins: add https://turbulenceking5.github.io (and
//      http://localhost:8080 if testing locally) → copy the Client ID
//      into GOOGLE_CLIENT_ID below.
//   5. Same Credentials page → Create Credentials → API key → restrict
//      it to the Google Picker API → copy it into GOOGLE_API_KEY below.
// Until both are filled in, the Docs tab's "Connect Google Drive" button
// shows a setup-needed message instead of failing silently.
export const GOOGLE_CLIENT_ID = '204377341271-jl5m0hva97k5uiiv4pkia6mine9b1mer.apps.googleusercontent.com';
export const GOOGLE_API_KEY = 'AIzaSyDLvMDSBSh7om7b_tjx_hTNg2tKmkEYiug';
