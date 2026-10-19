import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Spacer, TextField } from '@/components/ui';
import { createReview } from '@/lib/reviews';
import { useTheme } from '@/theme';

export function ReviewForm({ bookingId, authorId, sellerId, onDone }: { bookingId: string; authorId: string; sellerId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const send = async () => {
    if (rating === 0) {
      setErrorKey('reviews.pickRating');
      return;
    }
    setBusy(true);
    const failure = await createReview({ bookingId, authorId, sellerId, rating, body, lang: i18n.language.slice(0, 2) });
    setBusy(false);
    if (failure) setErrorKey(failure);
    else onDone();
  };

  return (
    <View>
      <Body>{t('reviews.howWasIt')}</Body>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n}`} onPress={() => setRating(n)}>
            <Text style={{ fontSize: 30, color: n <= rating ? theme.accent : theme.muted }}>{n <= rating ? '★' : '☆'}</Text>
          </Pressable>
        ))}
      </View>
      <TextField label={t('reviews.comment')} value={body} onChangeText={setBody} multiline maxLength={600} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer size={4} />
      <Button title={t('reviews.send')} onPress={() => void send()} loading={busy} />
    </View>
  );
}
