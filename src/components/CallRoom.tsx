import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body } from '@/components/ui';
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

function Controls({ lib, onHangup }: { lib: LiveKitNative; onHangup: () => void }) {
  const { t } = useTranslation();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = lib.useLocalParticipant();
  const button = (label: string, onPress: () => void, danger?: boolean) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ backgroundColor: danger ? '#B42318' : '#FFFFFF22', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 12 }}>
      {button(isMicrophoneEnabled ? t('calls.micOff') : t('calls.micOn'), () => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
      {button(isCameraEnabled ? t('calls.camOff') : t('calls.camOn'), () => void localParticipant.setCameraEnabled(!isCameraEnabled))}
      {button(t('calls.hangup'), onHangup, true)}
    </View>
  );
}

function Stage({ lib, onHangup }: { lib: LiveKitNative; onHangup: () => void }) {
  const tracks = lib.useTracks(['camera' as never]);
  const refs = tracks.filter((x) => lib.isTrackReference(x));
  const remote = refs.find((x) => !x.participant.isLocal);
  const local = refs.find((x) => x.participant.isLocal);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}>
        {remote ? <lib.VideoTrack trackRef={remote} style={{ flex: 1 }} /> : null}
        {local ? <lib.VideoTrack trackRef={local} mirror style={{ position: 'absolute', right: 12, top: 12, width: 96, height: 140, borderRadius: 12 }} /> : null}
      </View>
      <Controls lib={lib} onHangup={onHangup} />
    </View>
  );
}

/** Telefono (build di sviluppo): stanza LiveKit nativa con video dell'altra persona, la tua anteprima e i comandi. */
export function CallRoom({ serverUrl, token, onDisconnected }: CallRoomProps) {
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
    <View style={{ height: 560, borderRadius: 12, overflow: 'hidden' }}>
      <lk.LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={onDisconnected} options={{ adaptiveStream: { pixelDensity: 'screen' } }}>
        <Stage lib={lk} onHangup={onDisconnected} />
      </lk.LiveKitRoom>
    </View>
  );
}
