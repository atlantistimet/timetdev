import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Chip, ChipRow, ErrorText, Spacer, TextField } from '@/components/ui';
import { MAX_TAGS, searchPeople, setPostTag, type PersonHit, type PostTag } from '@/lib/feed';

/** Pannello dell'autore: toglie o aggiunge tag a un post già pubblicato. */
export function TagEditor({ postId, authorId, tags, onChange }: { postId: string; authorId: string; tags: PostTag[]; onChange: (next: PostTag[]) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void searchPeople(search, authorId).then((r) => {
        if (alive) setHits(r);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, authorId]);

  const active = tags.filter((x) => x.status === 'pending' || x.status === 'accepted');
  const shown = search.trim().length < 2 ? [] : hits.filter((h) => !active.some((x) => x.tagged_id === h.id));

  const remove = async (id: string) => {
    setErrorKey(null);
    const failure = await setPostTag(postId, id, false);
    if (failure) setErrorKey(failure);
    else onChange(tags.filter((x) => x.tagged_id !== id));
  };
  const add = async (p: PersonHit) => {
    setErrorKey(null);
    const failure = await setPostTag(postId, p.id, true);
    if (failure) return setErrorKey(failure);
    onChange([...tags, { tagged_id: p.id, status: 'pending', full_name: p.full_name, handle: p.handle }]);
    setSearch('');
    setHits([]);
  };

  return (
    <>
      <Spacer size={8} />
      <Body muted>{t('feed.tagEditHint')}</Body>
      {active.length > 0 ? (
        <ChipRow>
          {active.map((x) => (
            <Chip key={x.tagged_id} label={`${x.full_name}${x.status === 'pending' ? ` · ${t('feed.tagWaiting')}` : ''} ✕`} selected onPress={() => void remove(x.tagged_id)} />
          ))}
        </ChipRow>
      ) : null}
      {active.length < MAX_TAGS ? <TextField label={t('feed.tagSearch')} value={search} onChangeText={setSearch} autoCapitalize="none" /> : null}
      {shown.length > 0 ? (
        <ChipRow>
          {shown.map((p) => (
            <Chip key={p.id} label={p.handle ? `${p.full_name} · @${p.handle}` : p.full_name} selected={false} onPress={() => void add(p)} />
          ))}
        </ChipRow>
      ) : null}
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
    </>
  );
}
