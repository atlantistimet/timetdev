// Categorie delle notifiche push: ogni tipo di notifica (`notifications.kind`) appartiene a una categoria che l'utente può spegnere
// (tabella `notification_prefs`, migrazione 0044). Da tenere allineata a `src/lib/push-prefs.ts` nell'app.
export type PushCategory = 'bookings' | 'messages' | 'payments' | 'calls' | 'community' | 'reviews' | 'availability';

export const PUSH_CATEGORY: Record<string, PushCategory> = {
  booking_new: 'bookings',
  package_new: 'bookings',
  booking_cancelled: 'bookings',
  booking_no_show: 'bookings',
  message: 'messages',
  tip: 'payments',
  call_missed: 'calls',
  comment: 'community',
  follow: 'community',
  tag_request: 'community',
  tag_accepted: 'community',
  review: 'reviews',
  review_reply: 'reviews',
  review_shared: 'reviews',
  availability_expiring: 'availability',
};
