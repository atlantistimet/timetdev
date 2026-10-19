import { Platform, Share } from 'react-native';

export const postUrl = (id: string): string =>
  Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/p/${id}` : `https://timeet.world/p/${id}`;

/** Condivide un testo con un link: foglio di condivisione sul telefono, su web quello del browser oppure copia negli appunti. Restituisce true se ha copiato. */
export async function shareLink(message: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        await nav.share({ text: message, url });
        return 'shared';
      }
      await nav?.clipboard?.writeText(`${message}\n${url}`);
      return 'copied';
    }
    await Share.share({ message: `${message}\n${url}`, url });
    return 'shared';
  } catch {
    return 'failed';
  }
}
