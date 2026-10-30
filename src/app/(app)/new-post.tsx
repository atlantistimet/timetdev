import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MediaPicker } from '@/components/MediaView';
import { Body, Button, Chip, ChipRow, ErrorText, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MAX_TAGS, createPost, searchPeople, type PersonHit } from '@/lib/feed';
import { type MediaItem } from '@/lib/media';

export default function NewPostScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [tagged, setTagged] = useState<PersonHit[]>([]);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || search.trim().length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchPeople(search, userId).then((r) => {
        if (alive) setHits(r);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, userId]);

  const shownHits = search.trim().length < 2 ? [] : hits.filter((h) => !tagged.some((x) => x.id === h.id));

  const publish = async () => {
    if (!userId) return;
    if (!body.trim() && media.length === 0) return setErrorKey('feed.errors.empty');
    setSaving(true);
    setErrorKey(null);
    const r = await createPost({ authorId: userId, kind: 'update', body, lang: i18n.language, media, tagIds: tagged.map((x) => x.id) });
    setSaving(false);
    if (r.errorKey) setErrorKey(r.errorKey);
    else router.replace('/');
  };

  return (
    <Screen>
      <Title>{t('feed.newTitle')}</Title>
      <ChipRow>
        <Chip label={t('feed.kind.update')} selected onPress={() => {}} />
        <Chip label={t('feed.kind.offer')} selected={false} onPress={() => router.replace('/offer-edit')} />
        <Chip label={t('feed.kind.slots')} selected={false} onPress={() => router.replace('/slot-link-edit')} />
      </ChipRow>
      <Body muted>{t('feed.newHint')}</Body>
      <Spacer />
      <TextField label={t('feed.bodyLabel')} value={body} onChangeText={setBody} multiline maxLength={2000} placeholder={t('feed.bodyPlaceholder')} />
      {userId ? <MediaPicker items={media} onChange={setMedia} bucket="media" userId={userId} /> : null}
      <Spacer />
      <Body muted>{t('feed.tagHint')}</Body>
      {tagged.length > 0 ? (
        <ChipRow>
          {tagged.map((p) => (
            <Chip key={p.id} label={`${p.full_name} ✕`} selected onPress={() => setTagged((l) => l.filter((x) => x.id !== p.id))} />
          ))}
        </ChipRow>
      ) : null}
      {tagged.length < MAX_TAGS ? <TextField label={t('feed.tagSearch')} value={search} onChangeText={setSearch} autoCapitalize="none" /> : null}
      {shownHits.length > 0 ? (
        <ChipRow>
          {shownHits.map((p) => (
            <Chip
              key={p.id}
              label={p.handle ? `${p.full_name} · @${p.handle}` : p.full_name}
              selected={false}
              onPress={() => {
                setTagged((l) => [...l, p]);
                setSearch('');
                setHits([]);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('feed.publish')} onPress={() => void publish()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
