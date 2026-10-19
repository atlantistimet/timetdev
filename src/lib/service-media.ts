import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

export const MAX_PHOTOS = 6;
const BUCKET = 'service-media';

export type ServicePhoto = { id: string; path: string; position: number };

export const photoUrl = (path: string): string => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

export async function listPhotos(serviceId: string): Promise<ServicePhoto[]> {
  const { data } = await supabase.from('service_media').select('id, path, position').eq('service_id', serviceId).eq('type', 'image').order('position');
  return (data ?? []) as ServicePhoto[];
}

/** Prima foto di ciascun servizio, per le anteprime negli elenchi. */
export async function listCovers(serviceIds: string[]): Promise<Record<string, string>> {
  if (serviceIds.length === 0) return {};
  const { data } = await supabase.from('service_media').select('service_id, path, position').in('service_id', serviceIds).eq('type', 'image').order('position');
  const covers: Record<string, string> = {};
  for (const row of (data ?? []) as { service_id: string; path: string }[]) if (!covers[row.service_id]) covers[row.service_id] = row.path;
  return covers;
}

/** Sceglie una foto dalla galleria e la carica. Restituisce la chiave di traduzione dell'errore o null (anche se l'utente annulla). */
export async function addPhoto(serviceId: string, userId: string, current: number): Promise<string | null> {
  if (current >= MAX_PHOTOS) return 'photos.errors.limit';
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [4, 3] });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const type = asset.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${serviceId}-${Date.now()}.${ext}`;
  const blob = await (await fetch(asset.uri)).blob();
  if (blob.size > 5 * 1024 * 1024) return 'photos.errors.size';
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
  if (up.error) return 'errors.generic';
  const ins = await supabase.from('service_media').insert({ service_id: serviceId, path, type: 'image', position: current });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return ins.error.message.includes('too_many_photos') ? 'photos.errors.limit' : 'errors.generic';
  }
  return null;
}

export async function removePhoto(photo: ServicePhoto): Promise<string | null> {
  const { error } = await supabase.from('service_media').delete().eq('id', photo.id);
  if (error) return 'errors.generic';
  await supabase.storage.from(BUCKET).remove([photo.path]);
  return null;
}
