import { FunctionsHttpError } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const FUNCTION_NAME = 'stripe-connect-onboarding';

export type SellerAccount = {
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};

export type SellerState = 'none' | 'pending' | 'ready';

export function sellerState(account: SellerAccount | null): SellerState {
  if (!account) return 'none';
  return account.charges_enabled && account.payouts_enabled ? 'ready' : 'pending';
}

/** Stato dell'account venditore dell'utente (la policy di lettura mostra solo il proprio). */
export async function loadSellerAccount(userId: string): Promise<{ account: SellerAccount | null; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('stripe_accounts')
    .select('details_submitted, charges_enabled, payouts_enabled')
    .eq('seller_id', userId)
    .maybeSingle();
  if (error) return { account: null, errorKey: 'errors.generic' };
  return { account: data, errorKey: null };
}

async function callFunction<T>(action: 'onboard' | 'refresh'): Promise<{ data: T | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<T>(FUNCTION_NAME, { body: { action } });
  if (!error) return { data, errorKey: null };
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'adult_required') return { data: null, errorKey: 'errors.adultRequired' };
  }
  return { data: null, errorKey: 'errors.generic' };
}

/** Crea (se serve) l'account Stripe e restituisce il link alla verifica ospitata da Stripe. */
export async function requestOnboardingUrl(): Promise<{ url: string | null; errorKey: string | null }> {
  const { data, errorKey } = await callFunction<{ url: string }>('onboard');
  return { url: data?.url ?? null, errorKey: errorKey ?? (data?.url ? null : 'errors.generic') };
}

/** Chiede alla funzione di rileggere lo stato da Stripe (utile al ritorno dall'onboarding). */
export async function refreshSellerStatus(): Promise<{ account: SellerAccount | null; errorKey: string | null }> {
  const { data, errorKey } = await callFunction<SellerAccount>('refresh');
  if (errorKey || !data) return { account: null, errorKey: errorKey ?? 'errors.generic' };
  return {
    account: {
      details_submitted: data.details_submitted,
      charges_enabled: data.charges_enabled,
      payouts_enabled: data.payouts_enabled,
    },
    errorKey: null,
  };
}

/** Apre la pagina di Stripe. Sul web si resta nella stessa scheda, così il ritorno rientra nell'app. */
export function openStripeOnboarding(url: string): void {
  if (Platform.OS === 'web') {
    window.location.assign(url);
  } else {
    void Linking.openURL(url);
  }
}
