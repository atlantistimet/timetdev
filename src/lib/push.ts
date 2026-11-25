// Notifiche push su iPhone e Android (Expo Push Service). Sul web non fanno nulla: arriveranno più avanti con Web Push.
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { getNotification, openNotification, useUnreadCount } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export const PUSH_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

const TOKEN_KEY = 'push.token';
const SNOOZE_KEY = 'push.snoozeUntil';
const SNOOZE_MS = 30 * 86_400_000;
const CHANNEL_ID = 'default';

if (PUSH_SUPPORTED) {
  // Con l'app aperta la notifica compare come banner, senza suono.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export type PushState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Stato del permesso, e se il sistema permette ancora di chiederlo (su iPhone la richiesta compare una volta sola). */
export async function getPushPermission(): Promise<{ state: PushState; canAskAgain: boolean }> {
  if (!PUSH_SUPPORTED) return { state: 'unsupported', canAskAgain: false };
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return { state: 'granted', canAskAgain: false };
  return { state: p.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: p.canAskAgain };
}

// Su Android il canale deve esistere prima del permesso e del token.
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: i18n.t('push.channelName'),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Se il permesso c'è già, ottiene il token e lo lega all'utente connesso. Ritorna il token, o null. */
export async function registerPushDevice(): Promise<string | null> {
  if (!PUSH_SUPPORTED) return null;
  try {
    if ((await getPushPermission()).state !== 'granted') return null;
    await ensureChannel();
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_device', { p_token: token, p_platform: Platform.OS });
    if (error) return null;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    // niente rete o token non disponibile: si riprova al prossimo accesso
    return null;
  }
}

/** Scollega il dispositivo dall'utente (disconnessione): da chiamare prima di chiudere la sessione. */
export async function unregisterPushDevice(): Promise<void> {
  if (!PUSH_SUPPORTED) return;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.rpc('unregister_push_device', { p_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // la disconnessione non deve fermarsi qui
  }
}

/** Chiede il permesso al sistema (dopo la nostra schermata) e registra il dispositivo. */
export async function enablePush(): Promise<'granted' | 'denied'> {
  if (!PUSH_SUPPORTED) return 'denied';
  await ensureChannel();
  const p = await Notifications.requestPermissionsAsync();
  if (!p.granted) return 'denied';
  await registerPushDevice();
  return 'granted';
}

// ---- Schermata che precede la richiesta di sistema ----

export type PromptRole = 'client' | 'seller';
let promptRole: PromptRole | null = null;
const promptListeners = new Set<() => void>();
const setPromptRole = (r: PromptRole | null) => {
  promptRole = r;
  promptListeners.forEach((l) => l());
};

/** La schermata compare solo se il sistema permette ancora di chiedere e l'utente non ha detto «Non ora» negli ultimi 30 giorni. */
export async function requestPushPrompt(role: PromptRole): Promise<void> {
  if (!PUSH_SUPPORTED) return;
  const { state, canAskAgain } = await getPushPermission();
  if (state !== 'undetermined' || !canAskAgain) return;
  const until = Number((await AsyncStorage.getItem(SNOOZE_KEY)) ?? 0);
  if (until > Date.now()) return;
  setPromptRole(role);
}

/** «Non ora» (rinvia di 30 giorni) o chiusura dopo la scelta. */
export async function closePushPrompt(snooze: boolean): Promise<void> {
  if (snooze) await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  setPromptRole(null);
}

export function usePushPromptRole(): PromptRole | null {
  return useSyncExternalStore(
    (cb) => {
      promptListeners.add(cb);
      return () => promptListeners.delete(cb);
    },
    () => promptRole,
    () => null,
  );
}

/** Da montare una volta sola, solo su iPhone e Android: registra il dispositivo, allinea il badge e apre la schermata giusta al tocco di una notifica. */
export function usePushSync(userId: string | null): void {
  const unread = useUnreadCount(userId);
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!userId) return;
    void registerPushDevice();
    // se il token cambia lo si ripete (qui non si chiede il token nativo, quindi niente cicli)
    const sub = Notifications.addPushTokenListener(() => void registerPushDevice());
    return () => sub.remove();
  }, [userId]);

  useEffect(() => {
    if (userId) void Notifications.setBadgeCountAsync(unread);
  }, [userId, unread]);

  useEffect(() => {
    if (!userId || !last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = last.notification.request.content.data?.id;
    void Notifications.clearLastNotificationResponseAsync();
    if (typeof id !== 'string') return;
    void getNotification(id).then((n) => n && openNotification(n));
  }, [userId, last]);
}
