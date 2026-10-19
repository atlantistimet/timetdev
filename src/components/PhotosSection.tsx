import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Spacer } from '@/components/ui';
import { mediaUrl } from '@/lib/media';
import { addPhoto, listPhotos, MAX_PHOTOS, removePhoto, type ServicePhoto } from '@/lib/service-media';
import { useTheme } from '@/theme';

/** Foto e video di un servizio già salvato: aggiunta dalla galleria e rimozione. */
export function PhotosSection({ serviceId, userId }: { serviceId: string | null; userId: string }) {
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

  const add = useCallback(async () => {
    if (!serviceId) return;
    setBusy(true);
    setErrorKey(null);
    const failure = await addPhoto(serviceId, userId, photos.length);
    setBusy(false);
    if (failure) setErrorKey(failure);
    setReloadKey((k) => k + 1);
  }, [serviceId, userId, photos.length]);

  const remove = async (photo: ServicePhoto) => {
    setBusy(true);
    setErrorKey(null);
    const failure = await removePhoto(photo);
    setBusy(false);
    if (failure) setErrorKey(failure);
    setReloadKey((k) => k + 1);
  };

  return (
    <View>
      <Body>{t('photos.title')}</Body>
      {!serviceId ? (
        <Body muted>{t('photos.saveFirst')}</Body>
      ) : (
        <>
          <Spacer size={8} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.item}>
                {photo.type === 'video' ? (
                  <View style={[styles.thumb, styles.videoTile, { backgroundColor: theme.fill }]}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>▶ {t('media.video')}</Text>
                  </View>
                ) : (
                  <Image source={{ uri: mediaUrl('service-media', photo.path) }} style={[styles.thumb, { backgroundColor: theme.fill }]} />
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => void remove(photo)} style={[styles.remove, { backgroundColor: theme.glass }]}>
                  <Text style={{ color: theme.text }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Spacer size={8} />
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          {photos.length < MAX_PHOTOS ? <Button title={t('media.add')} variant="ghost" onPress={() => void add()} loading={busy} /> : <Body muted>{t('media.errors.limit')}</Body>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { marginRight: 8 },
  thumb: { width: 132, height: 99, borderRadius: 16 },
  videoTile: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
