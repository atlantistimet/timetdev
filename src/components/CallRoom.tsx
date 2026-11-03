import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Body } from '@/components/ui';
import { fonts, pastelFor, useTheme } from '@/theme';
import type { CallRoomProps } from '@/components/call-room.types';

/** Secondi di attesa prima che il server chiuda la chiamata se l'altra persona non torna (come CALL_STALE_SECONDS sul server). */
const ABSENT_GRACE_SECONDS = 75;

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

function Stage({ lib, onHangup, name, avatarPath, seed, myName, children, chat, onAddMinutes }: { lib: LiveKitNative; onHangup: () => void } & Pick<CallRoomProps, 'name' | 'avatarPath' | 'seed' | 'myName' | 'children' | 'chat' | 'onAddMinutes'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [chatOpen, setChatOpen] = useState(false);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = lib.useLocalParticipant();
  const room = lib.useRoomContext();
  const remoteCount = lib.useRemoteParticipants().length;
  // da quando l'altra persona non è più nella stanza (null = c'è)
  const [absentSince, setAbsentSince] = useState<number | null>(() => (remoteCount === 0 ? Date.now() : null));
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const gone = () => setAbsentSince((v) => v ?? Date.now());
    const back = () => setAbsentSince(null);
    const bus = room as unknown as { on: (event: string, fn: () => void) => void; off: (event: string, fn: () => void) => void };
    bus.on('participantDisconnected', gone);
    bus.on('participantConnected', back);
    return () => {
      bus.off('participantDisconnected', gone);
      bus.off('participantConnected', back);
    };
  }, [room]);
  useEffect(() => {
    if (absentSince === null) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [absentSince]);
  const waitLeft = absentSince === null ? null : Math.max(0, ABSENT_GRACE_SECONDS - Math.floor((tick - absentSince) / 1000));
  const tracks = lib.useTracks(['camera' as never]);
  const refs = tracks.filter((x) => lib.isTrackReference(x));
  const remote = refs.find((x) => !x.participant.isLocal);
  const local = refs.find((x) => x.participant.isLocal);
  const waitText = waitLeft === null ? null : `${Math.floor(waitLeft / 60)}:${String(waitLeft % 60).padStart(2, '0')}`;
  const round = (on: boolean, icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, dark?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, { backgroundColor: dark && on ? theme.ink : theme.bg }]}>
      <Ionicons name={icon} size={26} color={dark && on ? '#FFFFFF' : theme.ink} />
    </Pressable>
  );
  return (
    <View style={styles.stage}>
      <View style={[styles.hero, chatOpen && styles.heroSmall, { backgroundColor: pastelFor(seed ?? name) }]}>
        {remote ? <lib.VideoTrack trackRef={remote} style={StyleSheet.absoluteFill} objectFit="cover" /> : null}
        <View style={styles.heroTop}>
          <View style={[styles.tag, { backgroundColor: theme.accent }]}>
            <View style={[styles.dot, { backgroundColor: theme.ink }]} />
            <Text style={[styles.tagText, { color: theme.ink }]}>{t('calls.inCall')}</Text>
          </View>
        </View>
        {!remote ? <Avatar name={name ?? '?'} seed={seed} size={chatOpen ? 96 : 168} round={chatOpen ? 34 : 56} path={avatarPath} /> : <View />}
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
      {waitText ? (
        <View style={[styles.waitCard, { backgroundColor: theme.ink }]}>
          <Text style={[styles.waitTitle, { color: theme.accent }]}>{t('calls.otherLost', { name: (name ?? '').split(' ')[0] })}</Text>
          <Text style={[styles.waitSub, { color: theme.inkMuted }]}>{t('calls.otherLostSub', { time: waitText })}</Text>
        </View>
      ) : null}
      {chat ? <View style={chatOpen ? styles.chatShown : styles.chatHidden}>{chat}</View> : null}
      {chatOpen ? null : children}
      <View style={[styles.bar, { backgroundColor: theme.surface }]}>
        {round(isMicrophoneEnabled, isMicrophoneEnabled ? 'mic' : 'mic-off', isMicrophoneEnabled ? t('calls.micOff') : t('calls.micOn'), () => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
        {round(isCameraEnabled, isCameraEnabled ? 'videocam' : 'videocam-off', isCameraEnabled ? t('calls.camOff') : t('calls.camOn'), () => void localParticipant.setCameraEnabled(!isCameraEnabled), true)}
        {chat ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calls.chat')} onPress={() => setChatOpen((v) => !v)} style={[styles.round, { backgroundColor: chatOpen ? theme.ink : theme.bg }]}>
            <Ionicons name="chatbubble" size={24} color={chatOpen ? '#FFFFFF' : theme.ink} />
          </Pressable>
        ) : null}
        {onAddMinutes ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calls.addMinutes')} onPress={onAddMinutes} style={[styles.round, { backgroundColor: theme.accent }]}>
            <Ionicons name="add" size={30} color={theme.onAccent} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('calls.hangup')} onPress={onHangup} style={[styles.hang, { backgroundColor: '#D93A3F' }]}>
          <Ionicons name="call" size={28} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </View>
  );
}

/** Telefono (build di sviluppo): stanza LiveKit nativa con video dell'altra persona, la tua anteprima e i comandi. */
export function CallRoom({ serverUrl, token, onDisconnected, onHangup, name, avatarPath, seed, myName, children, chat, onAddMinutes }: CallRoomProps) {
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
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <lk.LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={onDisconnected} options={{ adaptiveStream: { pixelDensity: 'screen' } }}>
        <Stage lib={lk} onHangup={onHangup} name={name} avatarPath={avatarPath} seed={seed} myName={myName} chat={chat} onAddMinutes={onAddMinutes}>
          {children}
        </Stage>
      </lk.LiveKitRoom>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, gap: 8 },
  waitCard: { borderRadius: 24, padding: 14, gap: 2 },
  waitTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  waitSub: { fontFamily: fonts.medium, fontSize: 13 },
  hero: { height: 470, borderRadius: 38, padding: 18, paddingTop: 48, overflow: 'hidden', justifyContent: 'space-between', alignItems: 'center' },
  heroSmall: { height: 250, paddingTop: 40 },
  chatShown: { flex: 1 },
  chatHidden: { display: 'none' },
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
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  hang: { width: 84, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
