import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

export type MediaType = 'image' | 'video';
export type MediaItem = { path: string; type: MediaType };
export type Bucket = 'service-media' | 'media';

export const MAX_MEDIA = 6;
const IMAGE_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export const mediaUrl = (bucket: Bucket, path: string): string => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

/** Sceglie una foto o un video dalla galleria e lo carica nella cartella dell'utente. Null se l'utente annulla. */
export async function pickAndUpload(
  bucket: Bucket,
  userId: string,
  options: { videos?: boolean } = {},
): Promise<{ item: MediaItem | null; errorKey: string | null }> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options.videos === false ? ['images'] : ['images', 'videos'],
    quality: 0.8,
  });
  if (picked.canceled || !picked.assets[0]) return { item: null, errorKey: null };
  const asset = picked.assets[0];
  const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
  const mime = asset.mimeType && EXTENSIONS[asset.mimeType] ? asset.mimeType : isVideo ? 'video/mp4' : 'image/jpeg';
  const blob = await (await fetch(asset.uri)).blob();
  if (blob.size > (isVideo ? VIDEO_MAX : IMAGE_MAX)) return { item: null, errorKey: isVideo ? 'media.errors.videoSize' : 'media.errors.imageSize' };
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXTENSIONS[mime]}`;
  const up = await supabase.storage.from(bucket).upload(path, blob, { contentType: mime });
  if (up.error) return { item: null, errorKey: 'errors.generic' };
  return { item: { path, type: isVideo ? 'video' : 'image' }, errorKey: null };
}

export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
}
