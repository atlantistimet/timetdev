import { Pressable, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

/** Anteprima del video nella bolla: fermo, con il tasto play. Un tocco lo apre a schermo intero. */
export function ChatVideo({ uri, onOpen }: { uri: string; onOpen: () => void }) {
  const player = useVideoPlayer(uri);
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={{ width: 220, height: 160, borderRadius: 12, overflow: 'hidden', margin: 4, backgroundColor: '#000' }}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls={false} contentFit="cover" />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20 }}>▶</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Video a schermo intero, nelle proporzioni originali, con i comandi e avvio automatico. */
export function ChatVideoFull({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls contentFit="contain" />;
}
