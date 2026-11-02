import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Body } from '@/components/ui';
import { fonts, pastelFor, useTheme } from '@/theme';
import type { CallRoomProps } from '@/components/call-room.types';

// La libreria nativa non esiste in Expo Go: la si carica solo qui, e solo se c'è.
type LiveKitNative = typeof import('@livekit/react-native');
let lk: LiveKitNative | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  lk = require('@livekit/react-native') as LiveKitNative;
  lk.registerGlobals();
} catch {
  lk = null;
}

function Stage({ lib, onHangup, name, avatarPath, seed, myName, children }: { lib: LiveKitNative; onHangup: () => void } & Pick<CallRoomProps, 'name' | 'avatarPath' | 'seed' | 'myName' | 'children'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = lib.useLocalParticipant();
  const tracks = lib.useTracks(['camera' as never]);
  const refs = tracks.filter((x) => lib.isTrackReference(x));
  const remote = refs.find((x) => !x.participant.isLocal);
  const local = refs.find((x) => x.participant.isLocal);
  const round = (on: boolean, icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, dark?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, { backgroundColor: dark && on ? theme.ink : theme.bg }]}>
      <Ionicons name={icon} size={26} color={dark && on ? '#FFFFFF' : theme.ink} />
    </Pressable>
  );
  return (
    <View style={styles.stage}>
      <View style={[styles.hero, { backgroundColor: pastelFor(seed ?? name) }]}>
        {remote ? <lib.VideoTrack trackRef={remote} style={StyleSheet.absoluteFill} objectFit="cover" /> : null}
        <View style={styles.heroTop}>
          <View style={[styles.tag, { backgroundColor: theme.accent }]}>
            <View style={[styles.dot, { backgroundColor: theme.ink }]} />
            <Text style={[styles.tagText, { color: theme.ink }]}>{t('calls.inCall')}</Text>
          </View>
        </View>
        {!remote ? <Avatar name={name ?? '?'} seed={seed} size={168} round={56} path={avatarPath} /> : <View />}
        <View style={styles.heroBottom}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: remote ? '#FFFFFF' : theme.ink }]}>{name}</Text>
            {!remote ? <Text style={[styles.heroSub, { color: theme.ink }]}>{t('calls.cameraOff')}</Text> : null}
          </View>
          <View style={[styles.preview, { backgroundColor: theme.initials }]}>
            {local && isCameraEnabled ? <lib.VideoTrack trackRef={local} mirror style={StyleSheet.absoluteFill} objectFit="cover" /> : <Text style={[styles.previewText, { color: theme.ink }]}>{(myName ?? '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</Text>}
          </View>
        </View>
      </View>
      {children}
      <View style={[styles.bar, { backgroundColor: theme.surface }]}>
        {round(isMicrophoneEnabled, isMicrophoneEnabled ? 'mic' : 'mic-off', isMicrophoneEnabled ? t('calls.micOff') : t('calls.micOn'), () => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
        {round(isCameraEnabled, isCameraEnabled ? 'videocam' : 'videocam-off', isCameraEnabled ? t('calls.camOff') : t('calls.camOn'), () => void localParticipant.setCameraEnabled(!isCameraEnabled), true)}
        <Pressable accessibilityRole="button" accessibilityLabel={t('calls.hangup')} onPress={onHangup} style={[styles.hang, { backgroundColor: '#D93A3F' }]}>
          <Ionicons name="call" size={28} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </View>
  );
}

/** Telefono (build di sviluppo): stanza LiveKit nativa con video dell'altra persona, la tua anteprima e i comandi. */
export function CallRoom({ serverUrl, token, onDisconnected, name, avatarPath, seed, myName, children }: CallRoomProps) {
  const { t } = useTranslation();
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    if (!lk) return;
    let alive = true;
    void lk.AudioSession.startAudioSession().then(() => {
      if (alive) setAudioReady(true);
    });
    return () => {
      alive = false;
      void lk?.AudioSession.stopAudioSession();
    };
  }, []);

  if (!lk) return <Body muted>{t('calls.nativeNotReady')}</Body>;
  if (!audioReady) return null;
  return (
    <View style={{ flex: 1 }}>
      <lk.LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={onDisconnected} options={{ adaptiveStream: { pixelDensity: 'screen' } }}>
        <Stage lib={lk} onHangup={onDisconnected} name={name} avatarPath={avatarPath} seed={seed} myName={myName}>
          {children}
        </Stage>
      </lk.LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, gap: 8 },
  hero: { height: 470, borderRadius: 38, padding: 18, paddingTop: 48, overflow: 'hidden', justifyContent: 'space-between', alignItems: 'center' },
  heroTop: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'flex-end' },
  tag: { height: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontFamily: fonts.semibold, fontSize: 13 },
  heroBottom: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroName: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -1.2 },
  heroSub: { fontFamily: fonts.medium, fontSize: 14 },
  preview: { width: 74, height: 98, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previewText: { fontFamily: fonts.semibold, fontSize: 16 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 6, borderRadius: 999, marginTop: 'auto' },
  round: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  hang: { width: 96, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
});
