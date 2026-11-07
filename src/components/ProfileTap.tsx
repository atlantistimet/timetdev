import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from '@/components/Pressable';
import { supabase } from '@/lib/supabase';

/** Apre il profilo pubblico di una persona. Se l'@handle non è noto lo cerca dall'id. */
export async function openProfile(userId: string, handle?: string | null): Promise<void> {
  let h = handle ?? null;
  if (!h) {
    const { data } = await supabase.from('profiles').select('handle').eq('id', userId).maybeSingle();
    h = (data?.handle as string | null) ?? null;
  }
  if (h) router.push({ pathname: '/u/[handle]', params: { handle: h } });
}

/** Rende cliccabile (avatar, nome…) il rimando al profilo della persona. */
export function ProfileTap({ userId, handle, children, style, label }: { userId: string; handle?: string | null; children: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => void openProfile(userId, handle)} style={style}>
      {children}
    </Pressable>
  );
}
