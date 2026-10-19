import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Spacer } from '@/components/ui';
import { addPhoto, listPhotos, MAX_PHOTOS, photoUrl, removePhoto, type ServicePhoto } from '@/lib/service-media';
import { useTheme } from '@/theme';

/** Foto di un servizio già salvato: aggiunta dalla galleria e rimozione. */
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
                <Image source={{ uri: photoUrl(photo.path) }} style={[styles.thumb, { backgroundColor: theme.fill }]} />
                <Pressable accessibilityRole="button" accessibilityLabel={t('photos.remove')} onPress={() => void remove(photo)} style={[styles.remove, { backgroundColor: theme.glass }]}>
                  <Text style={{ color: theme.text }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Spacer size={8} />
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          {photos.length < MAX_PHOTOS ? <Button title={t('photos.add')} variant="ghost" onPress={() => void add()} loading={busy} /> : <Body muted>{t('photos.errors.limit')}</Body>}
        </>
      )}
    </View>
  );
}

/** Striscia di foto in sola lettura. */
export function PhotoStrip({ paths }: { paths: string[] }) {
  const theme = useTheme();
  if (paths.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
      {paths.map((p) => (
        <Image key={p} source={{ uri: photoUrl(p) }} style={[styles.thumb, { backgroundColor: theme.fill }]} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { marginRight: 8 },
  thumb: { width: 132, height: 99, borderRadius: 16, marginRight: 8 },
  strip: { marginVertical: 8 },
  remove: { position: 'absolute', top: 6, right: 14, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
