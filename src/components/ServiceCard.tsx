import { Image, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { Pressable } from '@/components/Pressable';
import { ProfileTap } from '@/components/ProfileTap';
import { mediaUrl, type MediaItem } from '@/lib/media';
import { fonts, pastelFor, radius, type, useTheme } from '@/theme';

export type ServiceCardProps = {
  id: string;
  title: string;
  price: string;
  meta: string;
  cover?: MediaItem | null;
  emoji?: string | null;
  live?: boolean;
  badge?: string | null;
  liveLabel: string;
  /** Persona che offre il servizio: se omessa (es. nel suo profilo) non compare la riga con avatar. */
  seller?: { id: string; name: string; handle: string | null; avatar: string | null } | null;
  rating?: number | null;
  onPress: () => void;
};

/** Card del servizio a due colonne: foto in alto, titolo, persona, prezzo e durata. */
export function ServiceCard({ id, title, price, meta, cover, emoji, live, badge, liveLabel, seller, rating, onPress }: ServiceCardProps) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={[styles.cover, { backgroundColor: pastelFor(id) }]}>
        {cover && cover.type === 'image' ? <Image source={{ uri: mediaUrl('service-media', cover.path) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Emoji name={emoji} size={44} />}
        {live ? <View style={styles.liveChip}><View style={styles.liveGreen} /><Text style={styles.chipText}>{liveLabel}</Text></View> : null}
        {badge ? <View style={[styles.discChip, { backgroundColor: theme.accent }]}><Text style={[styles.chipText, { color: theme.onAccent }]}>{badge}</Text></View> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{title}</Text>
        {seller ? (
          <ProfileTap userId={seller.id} handle={seller.handle} style={styles.who}>
            <Avatar name={seller.name} seed={seller.id} size={20} path={seller.avatar} />
            <Text numberOfLines={1} style={[type.small, { color: theme.muted, flex: 1 }]}>
              {seller.name.split(/\s+/)[0]}
              {rating ? ` · ★ ${Number(rating).toFixed(1).replace('.', ',')}` : ''}
            </Text>
          </ProfileTap>
        ) : rating ? (
          <Text style={[type.small, { color: theme.muted }]}>{`★ ${Number(rating).toFixed(1).replace('.', ',')}`}</Text>
        ) : null}
        <View style={styles.foot}>
          <View style={[styles.pricePill, { backgroundColor: theme.accent }]}><Text numberOfLines={1} style={[styles.priceText, { color: theme.onAccent }]}>{price}</Text></View>
          <Text numberOfLines={1} style={[type.small, { color: theme.muted, flexShrink: 1 }]}>{meta}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export const serviceGridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } as const;

const styles = StyleSheet.create({
  card: { width: '48.5%', flexGrow: 1, borderRadius: radius.card, overflow: 'hidden' },
  cover: { height: 132, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  liveChip: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  liveGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: '#151515' },
  discChip: { position: 'absolute', top: 8, right: 8, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  body: { padding: 12, gap: 6 },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 19, letterSpacing: -0.2, minHeight: 38 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  pricePill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  priceText: { fontFamily: fonts.semibold, fontSize: 15 },
});
