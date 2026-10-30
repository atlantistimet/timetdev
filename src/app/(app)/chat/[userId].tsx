import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { useTranslation } from 'react-i18next';
import { ChatVideo, ChatVideoFull } from '@/components/ChatVideo';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isBlockedByMe, loadMessages, markRead, openConversation, reportMessage, sendAttachment, sendMessage, setBlocked, signedUrls, type Message } from '@/lib/chat';
import { useChatPresence } from '@/lib/chat-presence';
import { loadProfileById } from '@/lib/public-profile';
import { useTheme } from '@/theme';

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
    <Pressable key={key ?? label} accessibilityRole="button" onPress={onPress} style={{ backgroundColor: theme.fill, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ color: theme.text }}>{label}</Text>
    </Pressable>
  );

  if (!messages) return <LoadingView />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <Text style={{ color: theme.text, fontSize: 22 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>{name}</Text>
            <Text style={{ color: otherTyping || otherOnline ? theme.accent : theme.muted, fontSize: 12 }}>
              {otherTyping ? t('chat.typing') : otherOnline ? t('chat.online') : ''}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.menu')} onPress={() => setPanel(panel === 'menu' ? null : 'menu')}>
            <Text style={{ color: theme.text, fontSize: 22 }}>⋯</Text>
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
          renderActions={() => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.attach')} onPress={() => setPanel(panel === 'attach' ? null : 'attach')} style={{ paddingHorizontal: 12, justifyContent: 'center' }}>
              <Text style={{ color: theme.text, fontSize: 26 }}>＋</Text>
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
          renderInputToolbar={blocked ? () => <Text style={{ color: theme.muted, padding: 12 }}>{t('chat.blockedByMe')}</Text> : undefined}
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
