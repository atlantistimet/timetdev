import type { ReactNode } from 'react';

export type CallRoomProps = {
  serverUrl: string;
  token: string;
  onDisconnected: () => void;
  /** Aspetto da mockup (solo telefono): chi c'è dall'altra parte e il riquadro dei minuti, che sta tra video e comandi. */
  name?: string;
  avatarPath?: string | null;
  seed?: string;
  myName?: string;
  /** Se c'è, nella barra dei comandi compare «Aggiungi minuti» (solo per chi paga). */
  onAddMinutes?: () => void;
  /** Pannello chat/file della chiamata: si apre dal tasto chat della barra. */
  chat?: ReactNode;
  children?: ReactNode;
};
