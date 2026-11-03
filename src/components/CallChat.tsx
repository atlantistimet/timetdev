import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ChatVideo, ChatVideoFull } from '@/components/ChatVideo';
import { loadMessages, markRead, openConversation, sendAttachment, sendMessage, signedUrls, type Message } from '@/lib/chat';
import { useChatPresence } from '@/lib/chat-presence';
import { fonts, useTheme } from '@/theme';

const mb = (bytes: number) => `${(bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

/** Chat e file della conversazione, dentro la chiamata (stesso thread della chat normale). */
export function CallChat({ me, otherId }: { me: string; otherId: string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'chat' | 'files'>('chat');
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const convRef = useRef<string | null>(null);
  const scroller = useRef<ScrollView>(null);
  const [lightbox, setLightbox] = useState<{ uri: string; video: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const id = convRef.current;
    if (!id) return;
    setMessages(await loadMessages(id));
    void markRead(id, me);
  }, [me]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const conv = await openConversation(me, otherId);
      if (!alive || !conv.id) return;
      convRef.current = conv.id;
      setConvId(conv.id);
      const list = await loadMessages(conv.id);
      if (alive) setMessages(list);
    })();
    return () => {
      alive = false;
    };
  }, [me, otherId]);

  const { notifyTyping } = useChatPresence(convId, me, otherId, refresh, 'callchat');

  useEffect(() => {
    const missing = messages.flatMap((m) => (m.attachment?.kind === 'media' && !urls[m.attachment.path] ? [m.attachment.path] : []));
    if (missing.length === 0) return;
    let alive = true;
    void signedUrls(missing).then((got) => {
      if (alive) setUrls((prev) => ({ ...prev, ...got }));
    });
    return () => {
      alive = false;
    };
  }, [messages, urls]);

  const send = async () => {
    const body = text.trim();
    if (!convId || !body) return;
    setText('');
    setErrorKey(null);
    const failure = await sendMessage(convId, me, body, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await refresh();
  };

  const upload = async (file: { uri: string; name: string; mime: string; width?: number; height?: number }) => {
    setAttachOpen(false);
    if (!convId) return;
    const failure = await sendAttachment(convId, me, file, i18n.language.slice(0, 2));
    if (failure) setErrorKey(failure);
    else await refresh();
  };

  const pickMedia = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    const a = res.canceled ? null : res.assets[0];
    if (a) await upload({ uri: a.uri, name: a.fileName ?? 'media', mime: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'), width: a.width, height: a.height });
    else setAttachOpen(false);
  };

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'], copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets[0];
    if (a) await upload({ uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/pdf' });
    else setAttachOpen(false);
  };

  const files = messages.flatMap((m) => (m.attachment?.kind === 'media' && m.attachment.type !== 'audio' ? [{ id: m.id, a: m.attachment }] : []));
  const open = (path: string, type: string) => {
    const uri = urls[path];
    if (!uri) return;
    if (type === 'image' || type === 'video') setLightbox({ uri, video: type === 'video' });
    else void Linking.openURL(uri);
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface }]}>
      <View style={[styles.tabs, { backgroundColor: theme.bg }]}>
        {(['chat', 'files'] as const).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.tab, tab === k && { backgroundColor: theme.ink }]}>
            <Text style={[styles.tabText, { color: tab === k ? '#FFFFFF' : theme.text, fontFamily: tab === k ? fonts.semibold : fonts.medium }]}>{t(k === 'chat' ? 'calls.tabChat' : 'calls.tabFiles')}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'chat' ? (
        <ScrollView ref={scroller} style={styles.list} contentContainerStyle={styles.listContent} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? <Text style={[styles.empty, { color: theme.muted }]}>{t('calls.chatEmpty')}</Text> : null}
          {messages.map((m) => {
            const mine = m.sender_id === me;
            const media = m.attachment?.kind === 'media' ? m.attachment : null;
            return (
              <View key={m.id} style={[styles.bubble, mine ? { alignSelf: 'flex-end', backgroundColor: theme.ink, borderBottomRightRadius: 8 } : { alignSelf: 'flex-start', backgroundColor: theme.bg, borderBottomLeftRadius: 8 }]}>
                {media && media.type === 'image' && urls[media.path] ? (
                  <Pressable accessibilityRole="imagebutton" onPress={() => open(media.path, media.type)}>
                    <Image source={{ uri: urls[media.path] }} style={styles.thumb} resizeMode="cover" />
                  </Pressable>
                ) : media && media.type === 'video' && urls[media.path] ? (
                  <ChatVideo uri={urls[media.path]} onOpen={() => open(media.path, media.type)} />
                ) : media ? (
                  <Pressable accessibilityRole="button" onPress={() => open(media.path, media.type)} style={styles.file}>
                    <Ionicons name={media.type === 'image' ? 'image' : media.type === 'video' ? 'videocam' : media.type === 'audio' ? 'mic' : 'document-text'} size={20} color={mine ? '#FFFFFF' : theme.text} />
                    <Text numberOfLines={1} style={{ color: mine ? '#FFFFFF' : theme.text, fontFamily: fonts.medium, fontSize: 14, maxWidth: 180 }}>{media.name}</Text>
                  </Pressable>
                ) : null}
                {m.attachment && m.attachment.kind !== 'media' ? <Text style={{ color: mine ? '#FFFFFF' : theme.text, fontSize: 15, fontFamily: fonts.medium }}>{m.attachment.kind === 'profile' ? `👤 ${m.attachment.name}` : `📅 ${m.attachment.title}`}</Text> : null}
                {m.body ? <Text style={{ color: mine ? '#FFFFFF' : theme.text, fontSize: 15, lineHeight: 20, fontFamily: fonts.regular }}>{m.body}</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {files.length === 0 ? <Text style={[styles.empty, { color: theme.muted }]}>{t('calls.filesEmpty')}</Text> : null}
          {files.map(({ id, a }) => (
            <Pressable key={id} accessibilityRole="button" onPress={() => open(a.path, a.type)} style={[styles.fileRow, { backgroundColor: theme.bg }]}>
              <View style={[styles.fileIcon, { backgroundColor: theme.surface }]}>
                {a.type === 'image' && urls[a.path] ? <Image source={{ uri: urls[a.path] }} style={styles.fileIcon} resizeMode="cover" /> : <Ionicons name={a.type === 'image' ? 'image' : a.type === 'video' ? 'videocam' : 'document-text'} size={20} color={theme.ink} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fonts.semibold, fontSize: 14 }}>{a.name}</Text>
                <Text style={{ color: theme.muted, fontFamily: fonts.regular, fontSize: 12 }}>{mb(a.size)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {errorKey ? <Text style={{ color: theme.danger, paddingHorizontal: 14, fontSize: 13 }}>{t(errorKey)}</Text> : null}
      {attachOpen ? (
        <View style={styles.attachRow}>
          <Pressable accessibilityRole="button" onPress={() => void pickMedia()} style={[styles.chip, { backgroundColor: theme.bg }]}>
            <Text style={{ color: theme.text, fontFamily: fonts.medium }}>{t('chat.attachSheet.media')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void pickDocument()} style={[styles.chip, { backgroundColor: theme.bg }]}>
            <Text style={{ color: theme.text, fontFamily: fonts.medium }}>{t('chat.attachSheet.document')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.input, { backgroundColor: theme.bg }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.attach')} onPress={() => setAttachOpen((v) => !v)} style={[styles.round, { backgroundColor: theme.surface }]}>
          <Ionicons name="add" size={24} color={theme.ink} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            notifyTyping();
          }}
          onSubmitEditing={() => void send()}
          placeholder={t('calls.chatPlaceholder')}
          placeholderTextColor={theme.muted}
          maxLength={2000}
          returnKeyType="send"
          style={[styles.field, { color: theme.text }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.send')} onPress={() => void send()} style={[styles.round, { backgroundColor: theme.accent }]}>
          <Ionicons name="arrow-up" size={22} color={theme.onAccent} />
        </Pressable>
      </View>
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <View style={styles.lightbox}>
          {lightbox?.video ? (
            <ChatVideoFull uri={lightbox.uri} />
          ) : lightbox ? (
            <Pressable onPress={() => setLightbox(null)} style={{ width: '100%', height: '100%' }}>
              <Image source={{ uri: lightbox.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.close')} onPress={() => setLightbox(null)} style={styles.lightboxClose}>
            <Text style={{ color: '#FFFFFF', fontSize: 28 }}>✕</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 120, borderRadius: 34, overflow: 'hidden' },
  tabs: { margin: 10, flexDirection: 'row', padding: 4, borderRadius: 999 },
  tab: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 15 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingVertical: 4, gap: 8 },
  empty: { fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  bubble: { maxWidth: '80%', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  thumb: { width: 200, height: 150, borderRadius: 14 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  lightboxClose: { position: 'absolute', top: 56, right: 24, padding: 8 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, padding: 8 },
  fileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  attachRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  input: { margin: 8, marginTop: 4, padding: 5, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: fonts.regular, paddingVertical: 8 },
});
