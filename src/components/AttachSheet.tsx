import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { formatEuro } from '@/lib/booking';
import { listShareableProfiles, type ProfileCard, type SlotCard } from '@/lib/chat';
import { listMyLinks, type SlotLink } from '@/lib/slot-links';
import { fonts, useTheme } from '@/theme';

type View_ = 'menu' | 'contacts' | 'slots';

/** Il "+" della chat: nuvolette per foto e video, documento, contatto e slot personalizzato. */
export function AttachSheet({
  visible,
  me,
  otherId,
  onClose,
  onMedia,
  onDocument,
  onProfile,
  onSlot,
}: {
  visible: boolean;
  me: string;
  otherId: string;
  onClose: () => void;
  onMedia: () => void;
  onDocument: () => void;
  onProfile: (card: ProfileCard) => void;
  onSlot: (card: SlotCard) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [view, setView] = useState<View_>('menu');
  const [profiles, setProfiles] = useState<ProfileCard[] | null>(null);
  const [links, setLinks] = useState<SlotLink[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      const [p, l] = await Promise.all([listShareableProfiles(me, otherId), listMyLinks(me)]);
      if (!alive) return;
      setProfiles(p);
      setLinks(l.links.filter((x) => !x.expires_at || new Date(x.expires_at).getTime() > Date.now()));
    })();
    return () => {
      alive = false;
    };
  }, [visible, me, otherId]);

  const close = () => {
    setView('menu');
    onClose();
  };

  const bubbles: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; bg: string; onPress: () => void }[] = [
    { key: 'media', icon: 'image', label: t('chat.attachSheet.media'), bg: '#F6C9AE', onPress: () => { close(); onMedia(); } },
    { key: 'doc', icon: 'document-text', label: t('chat.attachSheet.document'), bg: '#CFE3F6', onPress: () => { close(); onDocument(); } },
    { key: 'contact', icon: 'person', label: t('chat.attachSheet.contact'), bg: '#D6CBEA', onPress: () => setView('contacts') },
    { key: 'slot', icon: 'calendar', label: t('chat.attachSheet.slot'), bg: theme.accent, onPress: () => setView('slots') },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.scrim }]} onPress={close} accessibilityLabel={t('chat.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
        <View style={[styles.grab, { backgroundColor: theme.fill }]} />
        {view === 'menu' ? (
          <View style={styles.grid}>
            {bubbles.map((b) => (
              <Pressable key={b.key} accessibilityRole="button" onPress={b.onPress} style={styles.cell}>
                <View style={[styles.circle, { backgroundColor: b.bg }]}>
                  <Ionicons name={b.icon} size={28} color={theme.ink} />
                </View>
                <Text style={[styles.label, { color: theme.text }]}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.listWrap}>
            <View style={styles.listHead}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => setView('menu')} style={[styles.back, { backgroundColor: theme.surface }]}>
                <Ionicons name="chevron-back" size={20} color={theme.ink} />
              </Pressable>
              <Text style={[styles.title, { color: theme.text }]}>{view === 'contacts' ? t('chat.attachSheet.contactTitle') : t('chat.attachSheet.slotTitle')}</Text>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                {view === 'contacts' ? (
                  profiles && profiles.length > 0 ? (
                    profiles.map((p, i) => (
                      <Pressable key={p.id} accessibilityRole="button" onPress={() => { close(); onProfile(p); }} style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                        <Avatar name={p.name} seed={p.id} size={40} path={p.avatar} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{p.name}</Text>
                          {p.handle ? <Text style={[styles.sub, { color: theme.muted }]}>@{p.handle}</Text> : null}
                        </View>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.empty, { color: theme.muted }]}>{t('chat.attachSheet.noContacts')}</Text>
                  )
                ) : links && links.length > 0 ? (
                  links.map((l, i) => (
                    <Pressable
                      key={l.id}
                      accessibilityRole="button"
                      onPress={() => { close(); onSlot({ kind: 'slot', code: l.code, title: l.service_title || t('chat.attachSheet.slotTitle'), price_cents: l.price_cents, duration_min: l.duration_min }); }}
                      style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                      <View style={[styles.slotIcon, { backgroundColor: theme.accent }]}>
                        <Ionicons name="calendar" size={20} color={theme.onAccent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{l.service_title || t('chat.attachSheet.slotTitle')}</Text>
                        <Text style={[styles.sub, { color: theme.muted }]}>{`${l.duration_min} min · ${formatEuro(l.price_cents, i18n.language)}`}</Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text style={[styles.empty, { color: theme.muted }]}>{t('chat.attachSheet.noSlots')}</Text>
                )}
              </View>
            </ScrollView>
            {view === 'slots' ? (
              <Pressable accessibilityRole="button" onPress={() => { close(); router.push('/slot-link-edit'); }} style={[styles.create, { backgroundColor: theme.ink }]}>
                <Text style={styles.createText}>{t('chat.attachSheet.newSlot')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 34 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  cell: { width: '25%', alignItems: 'center', gap: 8 },
  circle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  listWrap: { gap: 12 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.5 },
  card: { borderRadius: 26, padding: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  slotIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.semibold, fontSize: 15 },
  sub: { fontFamily: fonts.regular, fontSize: 13 },
  empty: { fontFamily: fonts.regular, fontSize: 14, padding: 16, textAlign: 'center' },
  create: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  createText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 15 },
});
