import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Button, Spacer, TextField } from '@/components/ui';
import { replyToReview } from '@/lib/reviews';

/** Risposta del venditore sotto una recensione. Il venditore (`canReply`) può scriverla, modificarla o toglierla. */
export function ReviewReply({ reviewId, reply, sellerName, canReply, onDone }: { reviewId: string; reply: string | null; sellerName: string; canReply: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const save = async (value: string) => {
    setBusy(true);
    setError(false);
    const failure = await replyToReview(reviewId, value);
    setBusy(false);
    if (failure) return setError(true);
    setEditing(false);
    onDone();
  };

  if (editing) {
    return (
      <>
        <Spacer size={8} />
        <TextField label={t('reviews.replyLabel')} value={text} onChangeText={setText} multiline maxLength={500} error={error ? t('errors.generic') : null} />
        <Button title={t('reviews.replySend')} onPress={() => void save(text)} loading={busy} />
        <Spacer size={8} />
        {reply ? <Button title={t('reviews.replyRemove')} variant="ghost" onPress={() => void save('')} loading={busy} /> : null}
        <Spacer size={8} />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setEditing(false)} />
      </>
    );
  }
  return (
    <>
      {reply ? (
        <>
          <Spacer size={8} />
          <Body>{t('reviews.replyFrom', { name: sellerName })}</Body>
          <Body muted>{reply}</Body>
        </>
      ) : null}
      {canReply ? (
        <>
          <Spacer size={8} />
          <Button title={t(reply ? 'reviews.replyEdit' : 'reviews.reply')} variant="ghost" onPress={() => setEditing(true)} />
        </>
      ) : null}
    </>
  );
}
