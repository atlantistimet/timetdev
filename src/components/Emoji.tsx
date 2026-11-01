import { Image } from 'react-native';
import { emojiSource } from '@/lib/emoji';

/** Emoji Fluent 3D come immagine. Mai nei messaggi di chat né al posto delle icone di navigazione. */
export function Emoji({ name, size = 24 }: { name: string | null | undefined; size?: number }) {
  const source = emojiSource(name);
  if (!source) return null;
  return <Image accessible={false} source={source} style={{ width: size, height: size }} resizeMode="contain" />;
}
