import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { useTranslation } from 'react-i18next';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadMessages, markRead, openConversation, sendMessage, type Message } from '@/lib/chat';
import { useChatPresence } from '@/lib/chat-presence';
import { loadProfileById } from '@/lib/public-profile';
import { useTheme } from '@/theme';

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

  // GiftedChat vuole i messaggi dal più recente: ✓ = inviato, ✓✓ = letto.
  const items: IMessage[] = useMemo(
    () =>
      [...(messages ?? [])].reverse().map((m) => ({
        _id: m.id,
        text: m.body,
        createdAt: new Date(m.created_at),
        user: { _id: m.sender_id, name: m.sender_id === me ? '' : name },
        sent: true,
        received: !!m.read_at,
      })),
    [messages, me, name],
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
        </View>
        {errorKey ? <Text style={{ color: theme.danger, paddingHorizontal: 12 }}>{t(errorKey)}</Text> : null}
        <GiftedChat
          messages={items}
          onSend={(out) => void onSend(out)}
          user={{ _id: me }}
          isTyping={otherTyping}
          locale={i18n.language.slice(0, 2)}
          textInputProps={{ placeholder: t('chat.write'), maxLength: 2000, onChangeText: () => notifyTyping() }}
        />
      </View>
    </SafeAreaView>
  );
}
