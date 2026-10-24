import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react';
import { View } from 'react-native';
import type { CallRoomProps } from '@/components/call-room.types';

/** Stanza video/audio (web): i componenti ufficiali LiveKit, con comandi per microfono, camera, schermo e chat. */
export function CallRoom({ serverUrl, token, onDisconnected }: CallRoomProps) {
  return (
    <View style={{ height: 520, borderRadius: 12, overflow: 'hidden' }}>
      <LiveKitRoom serverUrl={serverUrl} token={token} connect audio video data-lk-theme="default" style={{ height: '100%' }} onDisconnected={onDisconnected}>
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </View>
  );
}
