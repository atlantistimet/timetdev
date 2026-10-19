import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadMessages, markRead, openConversation, sendMessage, type Message } from '@/lib/chat';
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
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
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

  // I nuovi messaggi arrivano controllando ogni pochi secondi.
  const refresh = useCallback(async () => {
    const id = convRef.current;
    if (!id) return;
    setMessages(await loadMessages(id));
    void markRead(id, me);
  }, [me]);
  useEffect(() => {
    if (!convId) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [convId, refresh]);

  if (!messages) return <LoadingView />;

  const send = async () => {
    if (!convId || !text.trim()) return;
    setBusy(true);
    setErrorKey(null);
    const failure = await sendMessage(convId, me, text, i18n.language.slice(0, 2));
    setBusy(false);
    if (failure) setErrorKey(failure);
    else {
      setText('');
      await refresh();
    }
  };

  return (
    <Screen>
      <Title>{name}</Title>
      <Spacer size={8} />
      {messages.length === 0 ? <Body muted>{t('chat.empty')}</Body> : null}
      {messages.map((m) => {
        const mine = m.sender_id === me;
        return (
          <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
            <View style={{ maxWidth: '85%', borderRadius: 16, padding: 10, backgroundColor: mine ? theme.primary : theme.fill }}>
              <Text style={{ color: mine ? theme.onPrimary : theme.text }}>{m.body}</Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 11 }}>
              {new Date(m.created_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
              {mine && m.read_at ? ` · ${t('chat.read')}` : ''}
            </Text>
          </View>
        );
      })}
      <Spacer size={8} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {convId ? (
        <>
          <TextField label={t('chat.write')} value={text} onChangeText={setText} multiline maxLength={2000} />
          <Button title={t('chat.send')} onPress={() => void send()} loading={busy} />
        </>
      ) : null}
      <Spacer size={8} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
