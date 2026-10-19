import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Spacer } from '@/components/ui';
import { type Bucket, type MediaItem, mediaUrl, MAX_MEDIA, pickAndUpload, removeFiles } from '@/lib/media';
import { useTheme } from '@/theme';
import { useState } from 'react';

function VideoItem({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width, height, borderRadius: 16, marginRight: 8 }} contentFit="cover" nativeControls />;
}

/** Galleria orizzontale di foto e video (sola lettura). */
export function MediaGallery({ items, bucket, size = 'large' }: { items: MediaItem[]; bucket: Bucket; size?: 'large' | 'small' }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  const width = size === 'large' ? 300 : 132;
  const height = size === 'large' ? 225 : 99;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
      {items.map((m) =>
        m.type === 'video' ? (
          <VideoItem key={m.path} uri={mediaUrl(bucket, m.path)} width={width} height={height} />
        ) : (
          <Image key={m.path} source={{ uri: mediaUrl(bucket, m.path) }} style={{ width, height, borderRadius: 16, marginRight: 8, backgroundColor: theme.fill }} />
        ),
      )}
    </ScrollView>
  );
}

/** Foto o video già caricati e da allegare a un contenuto non ancora salvato (post, anteprima del link). */
export function MediaPicker({
  items,
  onChange,
  bucket,
  userId,
  max = MAX_MEDIA,
  videos = true,
}: {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  bucket: Bucket;
  userId: string;
  max?: number;
  videos?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setErrorKey(null);
    const r = await pickAndUpload(bucket, userId, { videos });
    setBusy(false);
    if (r.errorKey) setErrorKey(r.errorKey);
    if (r.item) onChange([...items, r.item]);
  };
  const remove = async (m: MediaItem) => {
    onChange(items.filter((x) => x.path !== m.path));
    await removeFiles(bucket, [m.path]);
  };

  return (
    <View>
      {items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {items.map((m) => (
            <View key={m.path} style={styles.item}>
              {m.type === 'video' ? (
                <View style={[styles.thumb, styles.videoTile, { backgroundColor: theme.fill }]}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>▶ {t('media.video')}</Text>
                </View>
              ) : (
                <Image source={{ uri: mediaUrl(bucket, m.path) }} style={[styles.thumb, { backgroundColor: theme.fill }]} />
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => void remove(m)} style={[styles.remove, { backgroundColor: theme.glass }]}>
                <Text style={{ color: theme.text }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <Spacer size={8} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {items.length < max ? <Button title={t(videos ? 'media.add' : 'media.addPhoto')} variant="ghost" onPress={() => void add()} loading={busy} /> : <Body muted>{t('media.errors.limit')}</Body>}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { marginVertical: 8 },
  item: { marginRight: 8 },
  thumb: { width: 132, height: 99, borderRadius: 16 },
  videoTile: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
