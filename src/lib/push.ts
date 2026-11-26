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
const OFF_KEY = 'push.off'; // l'utente ha spento le notifiche su questo telefono
const SNOOZE_MS = 30 * 86_400_000;
const CHANNEL_ID = 'default';

if (PUSH_SUPPORTED) {
  // Con l'app aperta la notifica compare come banner, senza suono e senza restare nell'elenco del telefono:
  // dentro l'app c'è già il badge, e una copia rimasta sul blocco schermo dopo averla letta confonde.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
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
    if ((await AsyncStorage.getItem(OFF_KEY)) === '1') return null;
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

/** Alla disconnessione: scollega il dispositivo e dimentica anche la scelta «spente», che era di chi se ne va. */
export async function forgetPushDevice(): Promise<void> {
  await unregisterPushDevice();
  await AsyncStorage.removeItem(OFF_KEY).catch(() => undefined);
}

/** Stato per la schermata delle impostazioni: permesso del sistema e scelta dell'utente su questo telefono. */
export async function getPushStatus(): Promise<{ state: PushState; on: boolean }> {
  const { state } = await getPushPermission();
  const off = (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) === '1';
  return { state, on: state === 'granted' && !off };
}

/** Interruttore spento: il telefono non riceve più nulla finché non lo si riaccende (il permesso di sistema resta com'è). */
export async function disablePush(): Promise<void> {
  await AsyncStorage.setItem(OFF_KEY, '1');
  await unregisterPushDevice();
}

/** Interruttore acceso. Ritorna 'denied' se il sistema non permette più di chiedere: serve passare dalle Impostazioni del telefono. */
export async function turnOnPush(): Promise<'on' | 'denied'> {
  await AsyncStorage.removeItem(OFF_KEY);
  const { state, canAskAgain } = await getPushPermission();
  if (state === 'granted') return (await registerPushDevice()) ? 'on' : 'denied';
  if (state === 'undetermined' && canAskAgain) return (await enablePush()) === 'granted' ? 'on' : 'denied';
  return 'denied';
}

/** Notifica di prova ai propri dispositivi. 'none' = nessun dispositivo registrato. */
export async function sendTestPush(): Promise<'sent' | 'none' | 'failed'> {
  const { data, error } = await supabase.functions.invoke<{ sent: number; devices: number }>('push-test');
  if (error || !data) return 'failed';
  if (data.devices === 0) return 'none';
  return data.sent > 0 ? 'sent' : 'failed';
}

/** Chiede il permesso al sistema (dopo la nostra schermata) e registra il dispositivo. */
export async function enablePush(): Promise<'granted' | 'denied'> {
  if (!PUSH_SUPPORTED) return 'denied';
  await AsyncStorage.removeItem(OFF_KEY);
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
    if (!userId) return;
    void Notifications.setBadgeCountAsync(unread);
    // tutto letto: via anche le notifiche rimaste sul blocco schermo
    if (unread === 0) void Notifications.dismissAllNotificationsAsync();
  }, [userId, unread]);

  useEffect(() => {
    if (!userId || !last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = last.notification.request.content.data;
    const id = data?.id;
    void Notifications.clearLastNotificationResponseAsync();
    if (data?.test) return; // la notifica di prova non apre nulla
    if (typeof id !== 'string') {
      console.warn('[push] tocco su una notifica senza id', JSON.stringify(last.notification.request.content.data));
      return;
    }
    getNotification(id)
      .then((n) => {
        if (!n) console.warn('[push] notifica non trovata', id);
        else return openNotification(n);
      })
      .catch((e) => console.warn('[push] apertura della notifica fallita', e));
  }, [userId, last]);
}
