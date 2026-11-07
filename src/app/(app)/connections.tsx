import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Pressable } from '@/components/Pressable';
import { openProfile } from '@/components/ProfileTap';
import { Body, LoadingView, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fonts, useTheme } from '@/theme';

type Person = { id: string; full_name: string; handle: string | null; avatar_path: string | null; role_title: string | null };

/** Chi segue una persona e chi segue lei. Parametri: id, tab ('followers' | 'following'), name. */
export default function ConnectionsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id, tab: tabParam, name } = useLocalSearchParams<{ id: string; tab?: string; name?: string }>();
  const [tab, setTab] = useState<'followers' | 'following'>(tabParam === 'following' ? 'following' : 'followers');
  const [lists, setLists] = useState<Record<string, Person[]>>({});

  useEffect(() => {
    if (!id || lists[tab]) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('follows').select(tab === 'followers' ? 'follower_id' : 'followee_id').eq(tab === 'followers' ? 'followee_id' : 'follower_id', id).order('created_at', { ascending: false }).limit(200);
      const ids = ((data ?? []) as unknown as Record<string, string>[]).map((r) => r[tab === 'followers' ? 'follower_id' : 'followee_id']);
      const { data: people } = ids.length > 0 ? await supabase.from('profiles').select('id, full_name, handle, avatar_path, role_title').in('id', ids).is('deleted_at', null) : { data: [] };
      const byId = new Map(((people ?? []) as Person[]).map((p) => [p.id, p]));
      if (alive) setLists((l) => ({ ...l, [tab]: ids.map((i) => byId.get(i)).filter((p): p is Person => !!p) }));
    })();
    return () => {
      alive = false;
    };
  }, [id, tab, lists]);

  const list = lists[tab];
  return (
    <Screen back>
      <Title>{name ?? t('connections.title')}</Title>
      <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
        {(['followers', 'following'] as const).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.tab, tab === k && { backgroundColor: theme.ink }]}>
            <Text style={[styles.tabText, { color: tab === k ? theme.inkOn : theme.text }]}>{t(k === 'followers' ? 'connections.followers' : 'connections.following')}</Text>
          </Pressable>
        ))}
      </View>
      {!list ? <LoadingView /> : null}
      {list?.length === 0 ? <Body muted>{t(tab === 'followers' ? 'connections.noFollowers' : 'connections.noFollowing')}</Body> : null}
      {list?.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => void openProfile(p.id, p.handle)} style={[styles.row, { backgroundColor: theme.surface }]}>
          <Avatar name={p.full_name} seed={p.id} size={46} path={p.avatar_path} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{p.full_name}</Text>
            {p.role_title ? <Text numberOfLines={1} style={[styles.sub, { color: theme.muted }]}>{p.role_title}</Text> : null}
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  tab: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: fonts.semibold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 12 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  sub: { fontFamily: fonts.regular, fontSize: 13 },
});
