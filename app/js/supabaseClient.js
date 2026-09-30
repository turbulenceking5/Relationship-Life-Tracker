// Uses the vendored UMD build (js/vendor/supabase.js, loaded as a classic
// <script> before this module in index.html) instead of a CDN import, so
// the app has no runtime dependency on a third-party CDN being reachable.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
