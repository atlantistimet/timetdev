import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Spacer, TextField } from '@/components/ui';
import { addComment, deleteComment, loadComments, type Comment } from '@/lib/comments';
import { useTheme } from '@/theme';

export function CommentsSection({ postId, userId, postAuthorId, onChanged }: { postId: string; userId: string; postAuthorId: string; onChanged: (count: number) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await loadComments(postId);
      if (!alive) return;
      setComments(r.comments);
      setErrorKey(r.errorKey);
      onChanged(r.comments.length);
    })();
    return () => {
      alive = false;
    };
    // onChanged cambia a ogni render del genitore: conta solo il ricaricamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, reloadKey]);

  const send = async () => {
    setBusy(true);
    setErrorKey(null);
    const failure = await addComment(postId, userId, text);
    setBusy(false);
    if (failure) setErrorKey(failure);
    else {
      setText('');
      setReloadKey((k) => k + 1);
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      {comments === null ? <Body muted>…</Body> : null}
      {comments?.length === 0 ? <Body muted>{t('comments.none')}</Body> : null}
      {comments?.map((c) => (
        <View key={c.id} style={{ marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{c.author_name}</Text>
          <Text style={{ color: theme.text }}>{c.body}</Text>
          {c.author_id === userId || postAuthorId === userId ? (
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                if (!(await deleteComment(c.id))) setReloadKey((k) => k + 1);
              }}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{t('feed.delete')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Spacer size={4} />
      <TextField label={t('comments.write')} value={text} onChangeText={setText} maxLength={500} multiline />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('comments.send')} onPress={() => void send()} loading={busy} />
    </View>
  );
}
