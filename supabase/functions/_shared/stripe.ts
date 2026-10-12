// Piccolo client Stripe via REST (nessuna libreria: meno dipendenze e nessuna versione API nascosta).
// Segreti letti dall'ambiente della funzione: STRIPE_SECRET_KEY, STRIPE_API_VERSION (facoltativo).

const STRIPE_BASE = 'https://api.stripe.com';
// Versioni API fissate nel codice (indicate nella documentazione Stripe di ottobre 2026). Si cambiano solo di proposito.
// La versione stabile non permette dashboard Express con saldi negativi a carico di Stripe: serve l'anteprima.
export const STABLE_API_VERSION = '2026-09-30.endive';
export const PREVIEW_API_VERSION = '2026-09-30.preview';
const DEFAULT_API_VERSION = STABLE_API_VERSION;

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/** Converte un oggetto annidato nel formato `a[b][c]=1` che Stripe si aspetta. */
export function toForm(value: FormValue, prefix = '', out: URLSearchParams = new URLSearchParams()): URLSearchParams {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => toForm(item, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      toForm(inner, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

export class StripeError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Stripe ha risposto ${status}`);
  }
}

export async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, FormValue>,
  options: { idempotencyKey?: string; stripeAccount?: string; version?: string } = {},
): Promise<T> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY mancante');
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  headers['Stripe-Version'] = options.version ?? Deno.env.get('STRIPE_API_VERSION') ?? DEFAULT_API_VERSION;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.stripeAccount) headers['Stripe-Account'] = options.stripeAccount;

  let body: string | undefined;
  let url = `${STRIPE_BASE}${path}`;
  if (params) {
    const form = toForm(params);
    if (method === 'GET') url += `?${form.toString()}`;
    else {
      body = form.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  const response = await fetch(url, { method, headers, body });
  const json = await response.json();
  if (!response.ok) throw new StripeError(response.status, json);
  return json as T;
}

/** Chiamate all'API v2 di Stripe (Accounts v2, Account Links v2): corpo JSON. */
export async function stripeV2<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  options: { idempotencyKey?: string; version?: string } = {},
): Promise<T> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY mancante');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': options.version ?? Deno.env.get('STRIPE_API_VERSION') ?? DEFAULT_API_VERSION,
  };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${STRIPE_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  if (!response.ok) throw new StripeError(response.status, json);
  return json as T;
}

/** Verifica la firma di un webhook Stripe (header Stripe-Signature) con HMAC-SHA256. */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', keyData, encoder.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return signatures.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
