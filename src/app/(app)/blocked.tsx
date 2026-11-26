import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ErrorText, LoadingView } from '@/components/ui';
import { Group, Section, SettingsPage } from '@/components/settings';
import { useAuth } from '@/lib/auth';
import { listBlocked, unblockUser, type BlockedPerson } from '@/lib/safety';
import { fonts, useTheme } from '@/theme';

export default function BlockedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (me) setPeople(await listBlocked(me));
  }, [me]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!people) return <LoadingView />;
  return (
    <SettingsPage title={t('safety.blockedTitle')} subtitle={t('safety.blockedIntro')}>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {people.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.surface }]}>
          <Ionicons name="ban-outline" size={22} color={theme.muted} />
          <Text style={[styles.emptyText, { color: theme.muted }]}>{t('safety.blockedNone')}</Text>
        </View>
      ) : (
        <Section label={t('safety.blockedList')}>
          <Group>
            {people.map((p) => (
              <View key={p.id} style={styles.row}>
                <Avatar name={p.full_name} seed={p.id} size={40} path={p.avatar_path} />
                <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{p.full_name}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    const failure = await unblockUser(p.id);
                    setErrorKey(failure);
                    if (!failure) void load();
                  }}
                  style={[styles.btn, { backgroundColor: theme.bg }]}>
                  <Text style={[styles.btnText, { color: theme.text }]}>{t('safety.unblock')}</Text>
                </Pressable>
              </View>
            ))}
          </Group>
        </Section>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  btn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { fontFamily: fonts.semibold, fontSize: 14 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 16 },
  emptyText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
});
