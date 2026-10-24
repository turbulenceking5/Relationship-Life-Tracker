import { supabase } from './supabaseClient.js';
import { VAPID_PUBLIC_KEY } from './config.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getSubscriptionStatus(ctx) {
  if (!isPushSupported()) return 'unsupported';
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? 'enabled' : 'disabled';
}

const PUSH_PROMPT_KEY = 'pushPromptSeen';

// Whether to proactively ask about enabling push notifications — shown
// once per browser (same seen-once tolerance pattern as
// onboarding.js/changelog.js), and only when it's actually actionable
// right now: push needs to be supported, the app installed to the home
// screen (enablePush() requires this — see isStandalone() above), and
// not already enabled. Dismissing it isn't permanent: notifications can
// still be turned on later from ⚙️ Account & household.
export function shouldShowPushPrompt(status) {
  if (!isPushSupported() || !isStandalone() || status === 'enabled') return false;
  try {
    return localStorage.getItem(PUSH_PROMPT_KEY) !== '1';
  } catch {
    // Storage unavailable — treat as unseen rather than never asking,
    // same tolerance as onboarding.js/changelog.js.
    return true;
  }
}

export function markPushPromptSeen() {
  try {
    localStorage.setItem(PUSH_PROMPT_KEY, '1');
  } catch {
    // Won't persist across reloads — the prompt just reappears next
    // time, same harmless failure mode as onboarding/changelog.
  }
}

export async function enablePush(ctx) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      household_id: ctx.household.id,
      user_id: ctx.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

// One-tap nudge for an overdue item on the home dashboard — calls the
// remind-partner edge function, which looks up the *other* household
// member's push subscriptions server-side (RLS restricts
// push_subscriptions to its own owner, so the client can't read a
// partner's subscriptions directly) and sends them a push. See
// supabase/functions/remind-partner/index.ts.
export async function remindPartner(ctx, label) {
  const { data, error } = await supabase.functions.invoke('remind-partner', {
    body: { householdId: ctx.household.id, label },
  });
  if (error) throw error;
  return data;
}

export async function disablePush(ctx) {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  } else {
    // Local subscription is gone but a row might still exist (e.g. after
    // reinstalling the app) — clean it up by user, since we can't match by
    // endpoint anymore.
    await supabase.from('push_subscriptions').delete().eq('user_id', ctx.user.id);
  }
}
