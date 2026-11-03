import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Bubble, Composer, GiftedChat, InputToolbar, Send, type IMessage } from 'react-native-gifted-chat';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { AttachSheet } from '@/components/AttachSheet';
import { Emoji } from '@/components/Emoji';
import { VoiceBubble, clock } from '@/components/VoiceBubble';
import { formatEuro } from '@/lib/booking';
import { ChatVideo, ChatVideoFull } from '@/components/ChatVideo';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { REACTIONS, isBlockedByMe, loadChatBookings, loadMessages, loadReactions, toggleReaction, type ChatBooking, type ReactionKey, type ReactionMap, markRead, openConversation, reportMessage, sendAttachment, sendCard, sendMessage, type ProfileCard, type SlotCard, setBlocked, signedUrls, type Message } from '@/lib/chat';
import { useChatPresence } from '@/lib/chat-presence';
import { loadProfileById } from '@/lib/public-profile';
import { supabase } from '@/lib/supabase';
import { fonts, pastelFor, useTheme } from '@/theme';

type ChatItem = IMessage & { fileUrl?: string; fileName?: string; audioUrl?: string; durationMs?: number; card?: ProfileCard | SlotCard; booking?: ChatBooking; readAt?: string | null };
type Panel = null | 'menu' | { report: string };
const DOC_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/csv'];

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [convId, setConvId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [callServiceId, setCallServiceId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [blocked, setBlockedState] = useState(false);
  const [lightbox, setLightbox] = useState<{ uri: string; video: boolean } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [bookings, setBookings] = useState<ChatBooking[]>([]);
  const [reactFor, setReactFor] = useState<{ id: string; mine: boolean } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const convRef = useRef<string | null>(null);

  useEffect(() => {
    if (!me || !userId) return;
    let alive = true;
    (async () => {
      const [profile, conv] = await Promise.all([loadProfileById(userId), userId === me ? Promise.resolve({ id: null, errorKey: 'errors.generic' }) : openConversation(me, userId)]);
      if (!alive) return;
      setName(profile?.full_name ?? '');
      setAvatar(profile?.avatar_path ?? null);
      const { data: svc } = await supabase.from('services').select('id').eq('seller_id', userId).eq('kind', 'per_minute').eq('active', true).is('deleted_at', null).limit(1);
      if (alive) setCallServiceId((svc?.[0]?.id as string | undefined) ?? null);
      if (conv.id) {
        convRef.current = conv.id;
        setConvId(conv.id);
        setMessages(await loadMessages(conv.id));
        setReactions(await loadReactions(conv.id));
        setBookings(await loadChatBookings(me, userId));
        void markRead(conv.id, me);
        setBlockedState(await isBlockedByMe(me, userId));
      } else {
        setErrorKey(conv.errorKey);
        setMessages([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, userId]);

  const refresh = useCallback(async () => {
    const id = convRef.current;
    if (!id) return;
    setMessages(await loadMessages(id));
    setReactions(await loadReactions(id));
    void markRead(id, me);
  }, [me]);

  // Tempo reale: nuovi messaggi/letture, "sta scrivendo" e stato online passano dallo stesso canale.
  const { otherOnline, otherTyping, notifyTyping } = useChatPresence(convId, me, userId ?? '', refresh);

  useEffect(() => {
    if (!convId) return;
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [convId, refresh]);

  // Gli allegati sono privati: servono indirizzi temporanei.
  useEffect(() => {
    const missing = (messages ?? []).flatMap((m) => (m.attachment?.kind === 'media' && !urls[m.attachment.path] ? [m.attachment.path] : []));
    if (missing.length === 0) return;
    let alive = true;
    void signedUrls(missing).then((got) => {
      if (alive) setUrls((prev) => ({ ...prev, ...got }));
    });
    return () => {
      alive = false;
    };
  }, [messages, urls]);

  // GiftedChat vuole i messaggi dal più recente. Le prenotazioni fra voi due compaiono come card nel punto in cui sono state fatte.
  const items: ChatItem[] = useMemo(() => {
    const list = [...(messages ?? [])];
    const lastOwnRead = [...list].reverse().find((m) => m.sender_id === me && m.read_at)?.id;
    const rows: ChatItem[] = list.map((m) => ({
      _id: m.id,
      text: m.body,
      createdAt: new Date(m.created_at),
      user: { _id: m.sender_id, name: m.sender_id === me ? '' : name },
      sent: false,
      received: false,
      readAt: m.id === lastOwnRead ? m.read_at : null,
      image: m.attachment?.kind === 'media' && m.attachment.type === 'image' ? urls[m.attachment.path] : undefined,
      video: m.attachment?.kind === 'media' && m.attachment.type === 'video' ? urls[m.attachment.path] : undefined,
      fileUrl: m.attachment?.kind === 'media' && m.attachment.type === 'file' ? urls[m.attachment.path] : undefined,
      fileName: m.attachment?.kind === 'media' && m.attachment.type === 'file' ? m.attachment.name : undefined,
      audioUrl: m.attachment?.kind === 'media' && m.attachment.type === 'audio' ? urls[m.attachment.path] : undefined,
      durationMs: m.attachment?.kind === 'media' ? m.attachment.durationMs : undefined,
      card: m.attachment && m.attachment.kind !== 'media' ? m.attachment : undefined,
    }));
    const cards: ChatItem[] = bookings.map((b) => ({ _id: `booking-${b.id}`, text: '', createdAt: new Date(b.created_at), user: { _id: 'system' }, system: true, booking: b }));
    return [...rows, ...cards].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt));
  }, [messages, bookings, me, name, urls]);

  const myReaction = (messageId: string): ReactionKey | null => reactions[messageId]?.find((r) => r.userId === me)?.emoji ?? null;
  const react = async (emoji: ReactionKey) => {
    const target = reactFor;
    setReactFor(null);
    if (!target || !convId) return;
    const failure = await toggleReaction(convId, target.id, me, emoji, myReaction(target.id));
    if (failure) setErrorKey(failure);
    else setReactions(await loadReactions(convId));
  };

  const onSend = useCallback(
    async (out: IMessage[]) => {
      if (!convId) return;
      setErrorKey(null);
      const failure = await sendMessage(convId, me, out[0]?.text ?? '', i18n.language.slice(0, 2));
      if (failure) setErrorKey(failure);
      else await refresh();
    },
    [convId, me, i18n.language, refresh],
  );

  const reload = async (id: string) => setMessages(await loadMessages(id));

  const pickMedia = async () => {
    setPanel(null);
    if (!convId) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const mime = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const failure = await sendAttachment(convId, me, { uri: a.uri, name: a.fileName ?? 'media', mime, width: a.width, height: a.height }, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await reload(convId);
  };

  const pickDocument = async () => {
    setPanel(null);
    if (!convId) return;
    const res = await DocumentPicker.getDocumentAsync({ type: DOC_TYPES, copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const failure = await sendAttachment(convId, me, { uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/pdf' }, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await reload(convId);
  };

  const shareCard = async (card: ProfileCard | SlotCard) => {
    if (!convId) return;
    const failure = await sendCard(convId, me, card, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await reload(convId);
  };

  // Messaggio vocale: tocca il microfono per registrare, poi invia o cestina.
  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setRecMs(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [recording]);

  const startRecording = async () => {
    setErrorKey(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setErrorKey('chat.voice.denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecMs(0);
      setRecording(true);
    } catch {
      setErrorKey('chat.voice.failed');
    }
  };

  const stopRecording = async (send: boolean) => {
    const ms = recMs;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      return;
    }
    const uri = recorder.uri;
    if (!send || !uri || !convId) return;
    if (ms < 800) {
      setErrorKey('chat.voice.short');
      return;
    }
    const failure = await sendAttachment(convId, me, { uri, name: 'voice', mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', durationMs: ms }, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await reload(convId);
  };

  const toggleBlock = async () => {
    const next = !blocked;
    await setBlocked(userId ?? '', next);
    setBlockedState(next);
    setPanel(null);
  };

  const report = async (id: string, reason: string) => {
    const failure = await reportMessage(me, id, reason);
    setPanel(null);
    setInfo(failure ? null : t('chat.reportDone'));
    if (failure) setErrorKey(failure);
  };

  const chip = (label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} accessibilityRole="button" onPress={onPress} style={{ backgroundColor: theme.surface, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Text style={{ color: theme.text, fontFamily: fonts.medium }}>{label}</Text>
    </Pressable>
  );

  if (!messages) return <LoadingView />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={[headerStyles.head, { backgroundColor: pastelFor(userId) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={headerStyles.back}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
          <Avatar name={name || '?'} seed={userId} size={46} path={avatar} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[headerStyles.name, { color: theme.ink }]}>{name}</Text>
            {otherTyping || otherOnline ? (
              <View style={headerStyles.status}>
                <View style={[headerStyles.dot, { backgroundColor: theme.accent, borderColor: theme.ink }]} />
                <Text style={[headerStyles.statusText, { color: theme.ink }]}>{otherTyping ? t('chat.typing') : t('chat.online')}</Text>
              </View>
            ) : null}
          </View>
          {callServiceId ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.callName', { name })} onPress={() => router.push({ pathname: '/call-start', params: { serviceId: callServiceId } })} style={[headerStyles.call, { backgroundColor: theme.ink }]}>
              <Ionicons name="call" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.menu')} onPress={() => setPanel(panel === 'menu' ? null : 'menu')} style={headerStyles.back}>
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.ink} />
          </Pressable>
        </View>
        {panel !== null ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
            {panel === 'menu' ? (
              chip(blocked ? t('chat.unblock') : t('chat.block'), () => void toggleBlock())
            ) : (
              <>
                {chip(t('chat.reasonSpam'), () => void report(panel.report, 'spam'))}
                {chip(t('chat.reasonAbuse'), () => void report(panel.report, 'abuse'))}
                {chip(t('chat.reasonExplicit'), () => void report(panel.report, 'inappropriate'))}
                {chip(t('chat.reasonOther'), () => void report(panel.report, 'other'))}
              </>
            )}
            {chip(t('chat.close'), () => setPanel(null), 'close')}
          </View>
        ) : null}
        {reactFor ? (
          <View style={reactStyles.panel}>
            <View style={[reactStyles.pick, { backgroundColor: theme.surface }]}>
              {REACTIONS.map((e) => (
                <Pressable key={e} accessibilityRole="button" accessibilityLabel={e} onPress={() => void react(e)} style={[reactStyles.pickBtn, myReaction(reactFor.id) === e && { backgroundColor: theme.accent }]}>
                  <Emoji name={e} size={28} />
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!reactFor.mine ? chip(t('chat.reportMessage'), () => { setPanel({ report: reactFor.id }); setReactFor(null); }) : null}
              {chip(t('chat.close'), () => setReactFor(null), 'closeReact')}
            </View>
          </View>
        ) : null}
        {info ? <Text style={{ color: theme.accent, paddingHorizontal: 12 }}>{info}</Text> : null}
        {errorKey ? <Text style={{ color: theme.danger, paddingHorizontal: 12 }}>{t(errorKey)}</Text> : null}
        <GiftedChat<ChatItem>
          keyboardAvoidingViewProps={{ enabled: false }}
          messages={items}
          onSend={(out) => void onSend(out)}
          user={{ _id: me }}
          isTyping={otherTyping}
          locale={i18n.language.slice(0, 2)}
          onLongPressMessage={(_ctx, m) => {
            if (!m.system) setReactFor({ id: String(m._id), mine: m.user._id === me });
          }}
          renderSystemMessage={(p) => {
            const b = (p.currentMessage as ChatItem).booking;
            if (!b) return null;
            const start = new Date(b.starts_at);
            const mins = Math.round((new Date(b.ends_at).getTime() - start.getTime()) / 60_000);
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/session/[id]', params: { id: b.id } })} style={cardStyles.card}>
                <View style={[cardStyles.date, { backgroundColor: theme.accent }]}>
                  <Text style={[cardStyles.dateSmall, { color: theme.onAccent }]}>{new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(start)}</Text>
                  <Text style={[cardStyles.dateBig, { color: theme.onAccent }]}>{new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(start)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={cardStyles.tagRow}>
                    <Emoji name="party_popper" size={16} />
                    <Text style={cardStyles.tag}>{t('chat.bookedCard')}</Text>
                  </View>
                  <Text numberOfLines={2} style={cardStyles.title}>{b.service_title}</Text>
                  <Text style={cardStyles.meta}>{`${mins} min · ${t(`bookings.placeShort.${b.place}`)} · ${formatEuro(b.price_cents + b.extra_cents, i18n.language)}`}</Text>
                </View>
              </Pressable>
            );
          }}
          isUserAvatarVisible={false}
          renderAvatar={null}
          renderBubble={(p) => {
            const m = p.currentMessage as ChatItem;
            const mine = m.user._id === me;
            const rs = (reactions[String(m._id)] ?? []).slice(0, 2);
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: rs.length ? 10 : 0, marginLeft: mine && rs.length ? 12 : 0, marginRight: !mine && rs.length ? 12 : 0 }}>
                <View>
                  <Bubble
                    {...p}
                    wrapperStyle={{
                      left: { backgroundColor: theme.surface, borderRadius: 24, borderBottomLeftRadius: 8, paddingHorizontal: 4, paddingVertical: 2 },
                      right: { backgroundColor: theme.ink, borderRadius: 24, borderBottomRightRadius: 8, paddingHorizontal: 4, paddingVertical: 2 },
                    }}
                    textStyle={{ left: { color: theme.text, fontSize: 16, fontFamily: fonts.regular }, right: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.regular } }}
                  />
                  {rs.length ? (
                    <View style={[reactStyles.badge, mine ? { left: -12 } : { right: -12 }, { backgroundColor: theme.surface }]}>
                      {rs.map((r) => (
                        <Emoji key={r.userId} name={r.emoji} size={rs.length > 1 ? 16 : 20} />
                      ))}
                    </View>
                  ) : null}
                </View>
                {m.readAt ? <Text style={[reactStyles.read, { color: theme.muted }]}>{t('chat.readAt', { time: new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(m.readAt)) })}</Text> : null}
              </View>
            );
          }}
          renderInputToolbar={
            blocked
              ? () => <Text style={{ color: theme.muted, padding: 12 }}>{t('chat.blockedByMe')}</Text>
              : recording
                ? () => (
                    <View style={[recStyles.bar, { backgroundColor: theme.surface }]}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('chat.voice.cancel')} onPress={() => void stopRecording(false)} style={[recStyles.round, { backgroundColor: theme.bg }]}>
                        <Ionicons name="trash-outline" size={22} color={theme.danger} />
                      </Pressable>
                      <View style={recStyles.live}>
                        <View style={[recStyles.dot, { backgroundColor: theme.danger }]} />
                        <Text style={[recStyles.time, { color: theme.text }]}>{clock(recMs / 1000)}</Text>
                        <Text style={{ color: theme.muted, fontFamily: fonts.regular }}>{t('chat.voice.recording')}</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('chat.send')} onPress={() => void stopRecording(true)} style={[recStyles.round, { backgroundColor: theme.accent }]}>
                        <Ionicons name="arrow-up" size={24} color={theme.onAccent} />
                      </Pressable>
                    </View>
                  )
                : (p) => (
                  <InputToolbar
                    {...p}
                    containerStyle={{ backgroundColor: theme.surface, borderRadius: 999, marginHorizontal: 12, marginBottom: 12, padding: 6, borderTopWidth: 0 }}
                    primaryStyle={{ alignItems: 'center', gap: 6 }}
                  />
                )
          }
          renderComposer={(p) => (
            <Composer
              {...p}
              textInputProps={{
                ...p.textInputProps,
                style: {
                  flex: 1,
                  minHeight: 46,
                  fontSize: 16,
                  lineHeight: 22,
                  color: theme.text,
                  backgroundColor: 'transparent',
                  paddingHorizontal: 8,
                  paddingTop: Platform.OS === 'ios' ? 12 : 0,
                  paddingBottom: Platform.OS === 'ios' ? 12 : 0,
                  marginTop: 0,
                  marginBottom: 0,
                  textAlignVertical: 'center',
                  fontFamily: fonts.regular,
                },
              }}
            />
          )}
          renderSend={(p) =>
            p.text?.trim() ? (
              <Send {...p} containerStyle={{ width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0 }}>
                <Ionicons name="arrow-up" size={24} color={theme.onAccent} />
              </Send>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t('chat.voice.record')} onPress={() => void startRecording()} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mic" size={24} color={theme.onAccent} />
              </Pressable>
            )
          }
          renderActions={() => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.attach')} onPress={() => setAttachOpen(true)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={26} color={theme.ink} />
            </Pressable>
          )}
          renderMessageImage={(p) =>
            p.currentMessage.image ? (
              <Pressable accessibilityRole="imagebutton" onPress={() => setLightbox({ uri: p.currentMessage.image ?? '', video: false })} style={{ margin: 4 }}>
                <Image source={{ uri: p.currentMessage.image }} style={{ width: 220, height: 160, borderRadius: 12 }} resizeMode="cover" />
              </Pressable>
            ) : null
          }
          renderMessageVideo={(p) => (p.currentMessage.video ? <ChatVideo uri={p.currentMessage.video} onOpen={() => setLightbox({ uri: p.currentMessage.video ?? '', video: true })} /> : null)}
          renderCustomView={(p) => {
            const m = p.currentMessage as ChatItem;
            const mine = m.user._id === me;
            if (m.audioUrl) return <VoiceBubble uri={m.audioUrl} durationMs={m.durationMs} mine={mine} />;
            if (m.card?.kind === 'profile') {
              const c = m.card;
              return (
                <Pressable accessibilityRole="button" onPress={() => c.handle && router.push({ pathname: '/u/[handle]', params: { handle: c.handle } })} style={cardStyles.mini}>
                  <Avatar name={c.name} seed={c.id} size={44} path={c.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: mine ? '#FFFFFF' : theme.text, fontFamily: fonts.semibold, fontSize: 15 }}>{c.name}</Text>
                    <Text style={{ color: mine ? theme.inkMuted : theme.muted, fontFamily: fonts.regular, fontSize: 13 }}>{t('chat.contactCard')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={mine ? '#FFFFFF' : theme.muted} />
                </Pressable>
              );
            }
            if (m.card?.kind === 'slot') {
              const c = m.card;
              return (
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/s/[code]', params: { code: c.code } })} style={cardStyles.mini}>
                  <View style={[cardStyles.slotIcon, { backgroundColor: theme.accent }]}>
                    <Ionicons name="calendar" size={22} color={theme.onAccent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: mine ? '#FFFFFF' : theme.text, fontFamily: fonts.semibold, fontSize: 15 }}>{c.title}</Text>
                    <Text style={{ color: mine ? theme.inkMuted : theme.muted, fontFamily: fonts.regular, fontSize: 13 }}>{`${c.duration_min} min · ${formatEuro(c.price_cents, i18n.language)} · ${t('chat.slotCard')}`}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={mine ? '#FFFFFF' : theme.muted} />
                </Pressable>
              );
            }
            return m.fileName ? (
              <Pressable onPress={() => m.fileUrl && void Linking.openURL(m.fileUrl)} style={{ padding: 10 }}>
                <Text style={{ color: mine ? '#FFFFFF' : theme.text, textDecorationLine: 'underline' }}>{`📄 ${m.fileName}`}</Text>
              </Pressable>
            ) : null;
          }}
          textInputProps={{ placeholder: t('chat.write'), maxLength: 2000, onChangeText: () => notifyTyping() }}
        />
      </KeyboardAvoidingView>
      <AttachSheet visible={attachOpen} me={me} otherId={userId ?? ''} onClose={() => setAttachOpen(false)} onMedia={() => void pickMedia()} onDocument={() => void pickDocument()} onProfile={(c) => void shareCard(c)} onSlot={(c) => void shareCard(c)} />
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          {lightbox?.video ? (
            <ChatVideoFull uri={lightbox.uri} />
          ) : lightbox ? (
            <Pressable onPress={() => setLightbox(null)} style={{ width: '100%', height: '100%' }}>
              <Image source={{ uri: lightbox.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.close')} onPress={() => setLightbox(null)} style={{ position: 'absolute', top: 40, right: 24, padding: 8 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 28 }}>✕</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const headerStyles = StyleSheet.create({
  head: { marginHorizontal: 8, marginTop: 8, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 10, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, borderTopLeftRadius: 8, borderTopRightRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.semibold, fontSize: 17 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  statusText: { fontFamily: fonts.medium, fontSize: 13 },
  call: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});

const recStyles = StyleSheet.create({
  bar: { borderRadius: 999, marginHorizontal: 12, marginBottom: 12, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  live: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { fontFamily: fonts.semibold, fontSize: 17 },
});

const cardStyles = StyleSheet.create({
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minWidth: 240 },
  slotIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  card: { alignSelf: 'stretch', marginVertical: 10, backgroundColor: '#151515', borderRadius: 30, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  date: { width: 78, height: 70, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dateSmall: { fontFamily: fonts.semibold, fontSize: 12 },
  dateBig: { fontFamily: fonts.semibold, fontSize: 24, letterSpacing: -1 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { color: '#B9B9B3', fontFamily: fonts.regular, fontSize: 12 },
  title: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 16 },
  meta: { color: '#B9B9B3', fontFamily: fonts.regular, fontSize: 13 },
});

const reactStyles = StyleSheet.create({
  badge: { position: 'absolute', bottom: -10, minWidth: 32, height: 32, paddingHorizontal: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, shadowColor: '#151515', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  read: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  panel: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  pick: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, borderRadius: 999 },
  pickBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
