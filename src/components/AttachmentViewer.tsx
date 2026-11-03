import { useState } from 'react';
import { Image, Linking, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ChatVideoFull } from '@/components/ChatVideo';
import { Pressable } from '@/components/Pressable';
import { attachmentDownloadUrl } from '@/lib/chat';
import { fonts } from '@/theme';

export type ViewerItem = { path: string; name: string; type: 'image' | 'video' | 'file'; uri: string; size?: number };

const mb = (bytes: number) => `${(bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

/** Visualizzatore a schermo intero di foto, video e documenti della chat, con «Scarica». */
export function AttachmentViewer({ item, onClose }: { item: ViewerItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!item) return;
    setBusy(true);
    const url = await attachmentDownloadUrl(item.path, item.name);
    setBusy(false);
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank');
    else void Linking.openURL(url);
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {item?.type === 'video' ? (
          <ChatVideoFull uri={item.uri} />
        ) : item?.type === 'image' ? (
          <Pressable onPress={onClose} style={styles.fill}>
            <Image source={{ uri: item.uri }} style={styles.fill} resizeMode="contain" />
          </Pressable>
        ) : item ? (
          <View style={styles.doc}>
            <Ionicons name="document-text" size={64} color="#FFFFFF" />
            <Text numberOfLines={3} style={styles.docName}>{item.name}</Text>
            {item.size ? <Text style={styles.docSize}>{mb(item.size)}</Text> : null}
            <View style={styles.docButtons}>
              <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(item.uri)} style={[styles.docBtn, { backgroundColor: '#FFFFFF' }]}>
                <Text style={[styles.docBtnText, { color: '#111111' }]}>{t('chat.open')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.download')} onPress={() => void download()} style={[styles.round, { opacity: busy ? 0.5 : 1 }]}>
            <Ionicons name="download-outline" size={24} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.close')} onPress={onClose} style={styles.round}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fill: { width: '100%', height: '100%' },
  top: { position: 'absolute', top: 56, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  doc: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  docName: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 20, textAlign: 'center' },
  docSize: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.regular, fontSize: 14 },
  docButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  docBtn: { height: 48, paddingHorizontal: 24, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  docBtnText: { fontFamily: fonts.semibold, fontSize: 16 },
});
