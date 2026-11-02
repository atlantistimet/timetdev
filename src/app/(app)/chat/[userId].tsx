import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Bubble, Composer, GiftedChat, InputToolbar, Send, type IMessage } from 'react-native-gifted-chat';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ChatVideo, ChatVideoFull } from '@/components/ChatVideo';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isBlockedByMe, loadMessages, markRead, openConversation, reportMessage, sendAttachment, sendMessage, setBlocked, signedUrls, type Message } from '@/lib/chat';
import { useChatPresence } from '@/lib/chat-presence';
import { loadProfileById } from '@/lib/public-profile';
import { supabase } from '@/lib/supabase';
import { fonts, pastelFor, useTheme } from '@/theme';

type ChatItem = IMessage & { fileUrl?: string; fileName?: string };
type Panel = null | 'attach' | 'menu' | { report: string };

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
    const missing = (messages ?? []).flatMap((m) => (m.attachment && !urls[m.attachment.path] ? [m.attachment.path] : []));
    if (missing.length === 0) return;
    let alive = true;
    void signedUrls(missing).then((got) => {
      if (alive) setUrls((prev) => ({ ...prev, ...got }));
    });
    return () => {
      alive = false;
    };
  }, [messages, urls]);

  // GiftedChat vuole i messaggi dal più recente: ✓ = inviato, ✓✓ = letto.
  const items: ChatItem[] = useMemo(
    () =>
      [...(messages ?? [])].reverse().map((m) => ({
        _id: m.id,
        text: m.body,
        createdAt: new Date(m.created_at),
        user: { _id: m.sender_id, name: m.sender_id === me ? '' : name },
        sent: true,
        received: !!m.read_at,
        image: m.attachment?.type === 'image' ? urls[m.attachment.path] : undefined,
        video: m.attachment?.type === 'video' ? urls[m.attachment.path] : undefined,
        fileUrl: m.attachment?.type === 'file' ? urls[m.attachment.path] : undefined,
        fileName: m.attachment?.type === 'file' ? m.attachment.name : undefined,
      })),
    [messages, me, name, urls],
  );

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
    const failure = await sendAttachment(convId, me, { uri: a.uri, name: a.fileName ?? 'media', mime }, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await reload(convId);
  };

  const pickPdf = async () => {
    setPanel(null);
    if (!convId) return;
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const failure = await sendAttachment(convId, me, { uri: a.uri, name: a.name, mime: 'application/pdf' }, i18n.language.slice(0, 2));
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
      <View style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
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
            {panel === 'attach' ? (
              <>
                {chip(t('chat.photoVideo'), () => void pickMedia())}
                {chip(t('chat.pdf'), () => void pickPdf())}
              </>
            ) : panel === 'menu' ? (
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
        {info ? <Text style={{ color: theme.accent, paddingHorizontal: 12 }}>{info}</Text> : null}
        {errorKey ? <Text style={{ color: theme.danger, paddingHorizontal: 12 }}>{t(errorKey)}</Text> : null}
        <GiftedChat<ChatItem>
          messages={items}
          onSend={(out) => void onSend(out)}
          user={{ _id: me }}
          isTyping={otherTyping}
          locale={i18n.language.slice(0, 2)}
          onLongPressMessage={(_ctx, m) => {
            if (m.user._id !== me) setPanel({ report: String(m._id) });
          }}
          isUserAvatarVisible={false}
          renderAvatar={null}
          renderBubble={(p) => (
            <Bubble
              {...p}
              wrapperStyle={{
                left: { backgroundColor: theme.surface, borderRadius: 24, borderBottomLeftRadius: 8, paddingHorizontal: 4, paddingVertical: 2 },
                right: { backgroundColor: theme.ink, borderRadius: 24, borderBottomRightRadius: 8, paddingHorizontal: 4, paddingVertical: 2 },
              }}
              textStyle={{ left: { color: theme.text, fontSize: 16, fontFamily: fonts.regular }, right: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.regular } }}
            />
          )}
          renderInputToolbar={
            blocked
              ? () => <Text style={{ color: theme.muted, padding: 12 }}>{t('chat.blockedByMe')}</Text>
              : (p) => (
                  <InputToolbar
                    {...p}
                    containerStyle={{ backgroundColor: theme.surface, borderRadius: 999, marginHorizontal: 12, marginBottom: 12, padding: 6, borderTopWidth: 0 }}
                    primaryStyle={{ alignItems: 'center', gap: 6 }}
                  />
                )
          }
          renderComposer={(p) => <Composer {...p} textInputProps={{ ...p.textInputProps, style: { flex: 1, fontSize: 16, color: theme.text, backgroundColor: 'transparent', paddingHorizontal: 6, fontFamily: fonts.regular } }} />}
          renderSend={(p) => (
            <Send {...p} containerStyle={{ width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0 }}>
              <Ionicons name="arrow-up" size={24} color={theme.onAccent} />
            </Send>
          )}
          renderActions={() => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.attach')} onPress={() => setPanel(panel === 'attach' ? null : 'attach')} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
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
            return m.fileName ? (
              <Pressable onPress={() => m.fileUrl && void Linking.openURL(m.fileUrl)} style={{ padding: 10 }}>
                <Text style={{ color: theme.text, textDecorationLine: 'underline' }}>{`📄 ${m.fileName}`}</Text>
              </Pressable>
            ) : null;
          }}
          textInputProps={{ placeholder: t('chat.write'), maxLength: 2000, onChangeText: () => notifyTyping() }}
        />
      </View>
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
