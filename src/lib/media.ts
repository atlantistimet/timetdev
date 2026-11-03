import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

export type MediaType = 'image' | 'video';
export type MediaItem = { path: string; type: MediaType };
export type Bucket = 'service-media' | 'media' | 'avatars';

export const MAX_MEDIA = 6;
const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;
const AVATAR_MAX = 2 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/** Ridimensiona (lato lungo max `maxSide`) e ricomprime in JPEG: una foto da 8 MB scende a poche centinaia di KB. Se fallisce usa l'originale. */
async function compressImage(uri: string, width: number | undefined, height: number | undefined, maxSide: number): Promise<string> {
  try {
    const long = Math.max(width ?? 0, height ?? 0);
    const actions: ImageManipulator.Action[] = long > maxSide ? [{ resize: (width ?? 0) >= (height ?? 0) ? { width: maxSide } : { height: maxSide } }] : [];
    const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

export const mediaUrl = (bucket: Bucket, path: string): string => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

/** Sceglie una foto o un video dalla galleria e lo carica nella cartella dell'utente. Null se l'utente annulla. */
export async function pickAndUpload(
  bucket: Bucket,
  userId: string,
  options: { videos?: boolean } = {},
): Promise<{ item: MediaItem | null; errorKey: string | null }> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options.videos === false ? ['images'] : ['images', 'videos'],
    quality: 0.6,
  });
  if (picked.canceled || !picked.assets[0]) return { item: null, errorKey: null };
  try {
    const asset = picked.assets[0];
    const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
    const uri = isVideo ? asset.uri : await compressImage(asset.uri, asset.width, asset.height, 1600);
    const mime = isVideo ? (asset.mimeType && EXTENSIONS[asset.mimeType] ? asset.mimeType : 'video/mp4') : uri === asset.uri && asset.mimeType && EXTENSIONS[asset.mimeType] ? asset.mimeType : 'image/jpeg';
    const blob = await (await fetch(uri)).blob();
    if (blob.size > (isVideo ? VIDEO_MAX : IMAGE_MAX)) return { item: null, errorKey: isVideo ? 'media.errors.videoSize' : 'media.errors.imageSize' };
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXTENSIONS[mime]}`;
    const up = await supabase.storage.from(bucket).upload(path, blob, { contentType: mime });
    if (up.error) return { item: null, errorKey: 'errors.generic' };
    return { item: { path, type: isVideo ? 'video' : 'image' }, errorKey: null };
  } catch {
    return { item: null, errorKey: 'errors.generic' };
  }
}

export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
}

export const avatarUrl = (path: string | null | undefined): string | null => (path ? mediaUrl('avatars', path) : null);

/** Sceglie una foto quadrata, la carica in "avatars" e la imposta come foto profilo (togliendo la precedente). */
export async function pickAndSetAvatar(userId: string, previousPath: string | null): Promise<{ path: string | null; errorKey: string | null }> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
  if (picked.canceled || !picked.assets[0]) return { path: null, errorKey: null };
  const asset = picked.assets[0];
  const uri = await compressImage(asset.uri, asset.width, asset.height, 800);
  const mime = uri === asset.uri && asset.mimeType && EXTENSIONS[asset.mimeType] && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
  const blob = await (await fetch(uri)).blob();
  if (blob.size > AVATAR_MAX) return { path: null, errorKey: 'media.errors.imageSize' };
  const path = `${userId}/${Date.now()}.${EXTENSIONS[mime]}`;
  const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: mime });
  if (up.error) return { path: null, errorKey: 'errors.generic' };
  const save = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (save.error) {
    await removeFiles('avatars', [path]);
    return { path: null, errorKey: 'errors.generic' };
  }
  if (previousPath) await removeFiles('avatars', [previousPath]);
  return { path, errorKey: null };
}

export async function removeAvatar(userId: string, path: string): Promise<string | null> {
  const save = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (save.error) return 'errors.generic';
  await removeFiles('avatars', [path]);
  return null;
}
