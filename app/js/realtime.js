import { supabase } from './supabaseClient.js';

// Tables that represent a shared household list — a partner's change to
// any of these should refresh whatever's currently on screen. Excludes
// `personal_todos` (private per-user, RLS already restricts it to its
// owner so there's nothing cross-partner to sync) and anything that
// isn't a tab's own list (push_subscriptions, profiles). `households`
// is included separately below since it's keyed by `id`, not
// `household_id`.
const SHARED_TABLES = [
  'events', 'expenses', 'recurring_expenses', 'custom_goals',
  'goal_transactions', 'goal_tasks', 'rent_payments', 'mortgage_payments',
  'documents', 'grocery_items', 'recipes', 'settlements', 'custom_categories',
];

// One channel for the whole household, covering every shared table —
// simpler than a channel per tab, and since nothing here is rendered
// until a tab actually mounts, an unrelated table's event still only
// costs one extra callback, not an extra socket. `onChange(table,
// payload)` fires for every matching change; debouncing/filtering what
// to actually do about it is the caller's job (app.js), since "too soon
// to refresh" depends on what's on screen, not on this module.
export function subscribeHousehold(householdId, onChange) {
  const channel = supabase.channel(`household-${householdId}`);
  for (const table of SHARED_TABLES) {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `household_id=eq.${householdId}`,
    }, (payload) => onChange(table, payload));
  }
  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'households',
    filter: `id=eq.${householdId}`,
  }, (payload) => onChange('households', payload));
  channel.subscribe();
  return channel;
}

export function unsubscribeHousehold(channel) {
  if (channel) supabase.removeChannel(channel);
}
