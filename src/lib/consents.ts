import { supabase } from '@/lib/supabase';
import { ACCEPTED_DOCS, LEGAL_VERSION } from '@/content/legal';

export type ConsentKey = 'marketing_email' | 'marketing_push' | 'personalization' | 'analytics';
export type ConsentPrefs = Record<ConsentKey, boolean>;

export const defaultConsents: ConsentPrefs = {
  marketing_email: false,
  marketing_push: false,
  personalization: true,
  analytics: true,
};

export async function acceptLegal(locale: string): Promise<string | null> {
  const { error } = await supabase.rpc('accept_legal', { p_docs: [...ACCEPTED_DOCS], p_version: LEGAL_VERSION, p_locale: locale });
  return error ? 'errors.generic' : null;
}

export async function loadConsents(userId: string): Promise<ConsentPrefs> {
  const { data } = await supabase
    .from('consent_prefs')
    .select('marketing_email, marketing_push, personalization, analytics')
    .eq('user_id', userId)
    .maybeSingle();
  return { ...defaultConsents, ...((data as Partial<ConsentPrefs> | null) ?? {}) };
}

export async function setConsent(key: ConsentKey, granted: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('set_consent', { p_key: key, p_granted: granted });
  return error ? 'errors.generic' : null;
}

/** Versione dei termini che la persona ha accettato più di recente (o null). */
export async function lastAcceptedVersion(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('legal_acceptances')
    .select('version')
    .eq('user_id', userId)
    .eq('doc', 'terms')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { version: string } | null)?.version ?? null;
}
