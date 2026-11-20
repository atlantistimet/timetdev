// Token del check-in con QR (sessioni in presenza, migrazione 0040).
// Token = HMAC-SHA256(CHECKIN_SECRET, "<booking_id>:<finestra>") con finestre di 60 secondi; il codice a 6 cifre deriva dallo stesso HMAC.
// Si accettano la finestra corrente e la precedente: un token vale da 60 a 120 secondi.
// Il segreto sta solo nelle edge function (Supabase → Edge Functions → Secrets): il database non lo conosce.

export const CHECKIN_WINDOW_SECONDS = 60;
/** Codici a 6 cifre sbagliati oltre i quali la prenotazione non accetta più il codice (resta il QR). */
export const CHECKIN_MAX_CODE_FAILURES = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const CODE_PATTERN = /^\d{6}$/;

/** Id della prenotazione in forma canonica (minuscole), o null se non è un uuid. */
export function normalizeBookingId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

/** Risposte di checkin_status / checkin_booking → codice HTTP. */
export const CHECKIN_HTTP: Record<string, number> = {
  not_found: 404,
  wrong_party: 403,
  already_checked_in: 409,
  too_early: 409,
  too_late: 409,
  bad_token: 400,
  too_many_attempts: 429,
};

const encoder = new TextEncoder();
let cachedKey: Promise<CryptoKey> | null = null;

function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('CHECKIN_SECRET');
  if (!secret) throw new Error('CHECKIN_SECRET mancante');
  cachedKey ??= crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return cachedKey;
}

const windowAt = (nowMs: number) => Math.floor(nowMs / 1000 / CHECKIN_WINDOW_SECONDS);

async function mac(bookingId: string, window: number): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(`${bookingId}:${window}`)));
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** I primi 16 byte dell'HMAC (128 bit): 22 caratteri, abbastanza corti per un QR leggibile. */
const tokenOf = (m: Uint8Array) => base64url(m.slice(0, 16));

/** 6 cifre dallo stesso HMAC, con il troncamento dinamico dei codici monouso (RFC 4226). */
function codeOf(m: Uint8Array): string {
  const o = m[m.length - 1] & 0x0f;
  const n = ((m[o] & 0x7f) << 24) | (m[o + 1] << 16) | (m[o + 2] << 8) | m[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token e codice della finestra corrente, con i secondi che mancano alla rotazione. */
export async function checkinCredentials(bookingId: string, nowMs = Date.now()) {
  const w = windowAt(nowMs);
  const m = await mac(bookingId, w);
  return { token: tokenOf(m), code: codeOf(m), expiresIn: (w + 1) * CHECKIN_WINDOW_SECONDS - Math.floor(nowMs / 1000) };
}

/** Vero se il token (dal QR) o il codice (6 cifre) è quello della finestra corrente o della precedente. */
export async function verifyCheckin(bookingId: string, input: { token?: string; code?: string }, nowMs = Date.now()): Promise<boolean> {
  const w = windowAt(nowMs);
  for (const win of [w, w - 1]) {
    const m = await mac(bookingId, win);
    if (input.token !== undefined && safeEqual(input.token, tokenOf(m))) return true;
    if (input.code !== undefined && safeEqual(input.code, codeOf(m))) return true;
  }
  return false;
}
