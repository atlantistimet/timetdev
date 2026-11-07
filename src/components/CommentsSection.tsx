import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '@/components/Pressable';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ErrorText } from '@/components/ui';
import { SafetySheet } from '@/components/SafetySheet';
import { addComment, deleteComment, loadComments, type Comment } from '@/lib/comments';
import { timeAgo } from '@/lib/time';
import { fonts, useTheme } from '@/theme';

export function CommentsSection({ postId, userId, postAuthorId, onChanged }: { postId: string; userId: string; postAuthorId: string; onChanged: (count: number) => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [reporting, setReporting] = useState<Comment | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [nowMs, setNowMs] = useState(0);
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
      setNowMs(Date.now());
      setErrorKey(r.errorKey);
      onChanged(r.comments.length);
    })();
    return () => {
      alive = false;
    };
    // onChanged cambia a ogni render del genitore: conta solo il ricaricamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, reloadKey]);

  const hasText = text.trim().length > 0;

  const send = async () => {
    if (!hasText || busy) return;
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
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>{t('comments.title')}</Text>
        {comments ? <Text style={[styles.count, { color: theme.muted }]}>{comments.length}</Text> : null}
      </View>
      {comments?.length === 0 ? <Text style={[styles.none, { color: theme.muted }]}>{t('comments.none')}</Text> : null}
      {comments?.map((c) => {
        const canDelete = c.author_id === userId || postAuthorId === userId;
        return (
          <View key={c.id} style={styles.item}>
            <Avatar name={c.author_name} seed={c.author_id} size={32} />
            <View style={styles.flex}>
              <View style={[styles.bubble, { backgroundColor: theme.bg }]}>
                <Text style={[styles.author, { color: theme.text }]}>{c.author_name}</Text>
                <Text style={[styles.body, { color: theme.text }]}>{c.body}</Text>
              </View>
              <View style={styles.meta}>
                <Text style={[styles.metaText, { color: theme.muted }]}>{timeAgo(c.created_at, i18n.language, nowMs)}</Text>
                {c.author_id !== userId ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setReporting(c)}>
                    <Text style={[styles.metaAction, { color: theme.muted }]}>{t('safety.report')}</Text>
                  </Pressable>
                ) : null}
                {canDelete ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={async () => {
                      if (!(await deleteComment(c.id))) setReloadKey((k) => k + 1);
                    }}>
                    <Text style={[styles.metaAction, { color: theme.muted }]}>{t('feed.delete')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
      {reporting ? <SafetySheet visible onClose={() => setReporting(null)} entityType="comment" entityId={reporting.id} userId={reporting.author_id} name={reporting.author_name} start="report" /> : null}
      <View style={[styles.composer, { backgroundColor: theme.fill, borderColor: hasText ? theme.primary : 'transparent' }]}>
        <TextInput
          accessibilityLabel={t('comments.write')}
          value={text}
          onChangeText={setText}
          placeholder={t('comments.placeholder')}
          placeholderTextColor={theme.muted}
          maxLength={500}
          multiline
          style={[styles.input, { color: theme.text }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('comments.send')}
          accessibilityState={{ disabled: !hasText || busy }}
          disabled={!hasText || busy}
          haptic="light"
          onPress={() => void send()}
          style={[styles.sendBtn, { backgroundColor: hasText ? theme.primary : theme.line }]}>
          {busy ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="arrow-up" size={20} color={hasText ? theme.accent : theme.muted} />}
        </Pressable>
      </View>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 16 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { fontFamily: fonts.semibold, fontSize: 15 },
  count: { fontFamily: fonts.medium, fontSize: 15 },
  none: { fontFamily: fonts.medium, fontSize: 14 },
  item: { flexDirection: 'row', gap: 10 },
  bubble: { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start', maxWidth: '100%' },
  author: { fontFamily: fonts.semibold, fontSize: 13 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 14, marginTop: 4 },
  metaText: { fontFamily: fonts.medium, fontSize: 12 },
  metaAction: { fontFamily: fonts.semibold, fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 24, borderWidth: 1.5, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 6 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, minHeight: 40, maxHeight: 120, paddingVertical: 10 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
