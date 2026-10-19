import { Redirect, useLocalSearchParams } from 'expo-router';

/** Indirizzo condiviso (…/s/<codice>): porta alla prenotazione da link. */
export default function SlotLinkEntry() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/book', params: { code } }} />;
}
