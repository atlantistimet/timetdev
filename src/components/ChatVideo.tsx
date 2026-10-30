import { View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

/** Video dentro una bolla della chat, con i comandi del sistema. */
export function ChatVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <View style={{ width: 220, height: 160, borderRadius: 12, overflow: 'hidden', margin: 4 }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls contentFit="contain" />
    </View>
  );
}
