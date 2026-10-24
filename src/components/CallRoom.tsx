import { Body } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import type { CallRoomProps } from '@/components/call-room.types';

/** Telefono: la stanza video nativa (LiveKit React Native) richiede la build di sviluppo, non ancora attiva. */
export function CallRoom(props: CallRoomProps) {
  const { t } = useTranslation();
  void props;
  return <Body muted>{t('calls.nativeNotReady')}</Body>;
}
