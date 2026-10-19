import { type MediaItem, type MediaType, MAX_MEDIA, pickAndUpload, removeFiles } from '@/lib/media';
import { supabase } from '@/lib/supabase';

const BUCKET = 'service-media';
export const MAX_PHOTOS = MAX_MEDIA;

export type ServicePhoto = { id: string; path: string; type: MediaType; position: number };

export async function listPhotos(serviceId: string): Promise<ServicePhoto[]> {
  const { data } = await supabase.from('service_media').select('id, path, type, position').eq('service_id', serviceId).order('position');
  return (data ?? []) as ServicePhoto[];
}

/** Prima foto o video di ciascun servizio, per le anteprime negli elenchi. */
export async function listCovers(serviceIds: string[]): Promise<Record<string, MediaItem>> {
  if (serviceIds.length === 0) return {};
  const { data } = await supabase.from('service_media').select('service_id, path, type, position').in('service_id', serviceIds).order('position');
  const covers: Record<string, MediaItem> = {};
  for (const row of (data ?? []) as { service_id: string; path: string; type: MediaType }[]) {
    if (!covers[row.service_id]) covers[row.service_id] = { path: row.path, type: row.type };
  }
  return covers;
}

/** Sceglie una foto o un video e lo aggiunge al servizio. Restituisce la chiave di traduzione dell'errore o null (anche se l'utente annulla). */
export async function addPhoto(serviceId: string, userId: string, current: number): Promise<string | null> {
  if (current >= MAX_PHOTOS) return 'media.errors.limit';
  const { item, errorKey } = await pickAndUpload(BUCKET, userId);
  if (!item) return errorKey;
  const ins = await supabase.from('service_media').insert({ service_id: serviceId, path: item.path, type: item.type, position: current });
  if (ins.error) {
    await removeFiles(BUCKET, [item.path]);
    return ins.error.message.includes('too_many_photos') ? 'media.errors.limit' : 'errors.generic';
  }
  return null;
}

export async function removePhoto(photo: ServicePhoto): Promise<string | null> {
  const { error } = await supabase.from('service_media').delete().eq('id', photo.id);
  if (error) return 'errors.generic';
  await removeFiles(BUCKET, [photo.path]);
  return null;
}
