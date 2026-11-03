import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ErrorText } from '@/components/ui';
import { mediaUrl, type MediaItem } from '@/lib/media';
import { addPhoto, discardDraftPhoto, listPhotos, MAX_PHOTOS, pickDraftPhoto, removePhoto, type ServicePhoto } from '@/lib/service-media';
import { fonts, useTheme } from '@/theme';

type Tile = { key: string; path: string; type: 'image' | 'video' };

/**
 * Foto e video di un servizio. Con `serviceId` agiscono subito sul servizio salvato; senza, restano in bozza
 * (`draft` / `onDraftChange`) e vengono collegate quando il servizio viene creato. Si può anche non avere nessuna foto.
 */
export function PhotosSection({ serviceId, userId, draft, onDraftChange }: { serviceId: string | null; userId: string; draft?: MediaItem[]; onDraftChange?: (items: MediaItem[]) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [photos, setPhotos] = useState<ServicePhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!serviceId) return;
    let alive = true;
    (async () => {
      const list = await listPhotos(serviceId);
      if (alive) setPhotos(list);
    })();
    return () => {
      alive = false;
    };
  }, [serviceId, reloadKey]);

  const tiles: Tile[] = serviceId
    ? photos.map((p) => ({ key: p.id, path: p.path, type: p.type }))
    : (draft ?? []).map((m) => ({ key: m.path, path: m.path, type: m.type }));

  const add = useCallback(async () => {
    setBusy(true);
    setErrorKey(null);
    if (serviceId) {
      const failure = await addPhoto(serviceId, userId, photos.length);
      if (failure) setErrorKey(failure);
      setReloadKey((k) => k + 1);
    } else {
      const r = await pickDraftPhoto(userId, (draft ?? []).length);
      if (r.errorKey) setErrorKey(r.errorKey);
      if (r.item) onDraftChange?.([...(draft ?? []), r.item]);
    }
    setBusy(false);
  }, [serviceId, userId, photos.length, draft, onDraftChange]);

  const remove = async (tile: Tile) => {
    setBusy(true);
    setErrorKey(null);
    if (serviceId) {
      const photo = photos.find((p) => p.id === tile.key);
      if (photo) {
        const failure = await removePhoto(photo);
        if (failure) setErrorKey(failure);
      }
      setReloadKey((k) => k + 1);
    } else {
      onDraftChange?.((draft ?? []).filter((m) => m.path !== tile.path));
      await discardDraftPhoto(tile.path);
    }
    setBusy(false);
  };

  return (
    <View style={{ gap: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {tiles.map((tile) => (
          <View key={tile.key}>
            {tile.type === 'video' ? (
              <View style={[styles.tile, styles.videoTile, { backgroundColor: theme.fill }]}>
                <Ionicons name="play" size={26} color={theme.text} />
              </View>
            ) : (
              <Image source={{ uri: mediaUrl('service-media', tile.path) }} style={[styles.tile, { backgroundColor: theme.fill }]} />
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => void remove(tile)} disabled={busy} style={[styles.remove, { backgroundColor: theme.glass }]}>
              <Ionicons name="close" size={16} color={theme.text} />
            </Pressable>
          </View>
        ))}
        {tiles.length < MAX_PHOTOS ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('media.add')} onPress={() => void add()} disabled={busy} style={[styles.tile, styles.add, { borderColor: theme.muted, opacity: busy ? 0.5 : 1 }]}>
            <Ionicons name="camera-outline" size={24} color={theme.text} />
            <Text style={[styles.count, { color: theme.muted }]}>{`${tiles.length} / ${MAX_PHOTOS}`}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  tile: { width: 92, height: 92, borderRadius: 24 },
  videoTile: { alignItems: 'center', justifyContent: 'center' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  count: { fontFamily: fonts.medium, fontSize: 12 },
  remove: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
