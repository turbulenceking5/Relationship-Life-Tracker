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
