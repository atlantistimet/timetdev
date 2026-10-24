// Token di accesso LiveKit (JWT HS256) firmato qui, sul server: la chiave segreta non arriva mai all'app.
// Segreti letti dall'ambiente della funzione: LIVEKIT_URL (wss://...), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
const enc = new TextEncoder();
const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function livekitConfigured(): boolean {
  return !!(Deno.env.get('LIVEKIT_URL') && Deno.env.get('LIVEKIT_API_KEY') && Deno.env.get('LIVEKIT_API_SECRET'));
}

export async function livekitToken(input: { room: string; identity: string; name: string; ttlSeconds: number }): Promise<{ url: string; token: string }> {
  const url = Deno.env.get('LIVEKIT_URL')!;
  const key = Deno.env.get('LIVEKIT_API_KEY')!;
  const secret = Deno.env.get('LIVEKIT_API_SECRET')!;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: key, sub: input.identity, name: input.name, nbf: now - 10, exp: now + input.ttlSeconds,
    video: { room: input.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  }));
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`${header}.${payload}`)));
  return { url, token: `${header}.${payload}.${b64url(sig)}` };
}
