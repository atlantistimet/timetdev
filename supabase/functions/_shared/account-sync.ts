// Rilegge lo stato di un account venditore da Stripe e lo salva in stripe_accounts.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { PREVIEW_API_VERSION, stripeRequest } from './stripe.ts';

type V1Account = {
  id: string;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements?: { currently_due?: string[]; past_due?: string[] };
};

export type AccountStatus = {
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
};

export async function syncAccountStatus(admin: SupabaseClient, accountId: string): Promise<AccountStatus> {
  // Per gli account v2 la lettura "v1" restituisce i campi di stato classici.
  const account = await stripeRequest<V1Account>('GET', `/v1/accounts/${accountId}`, undefined, { version: PREVIEW_API_VERSION });
  const status: AccountStatus = {
    details_submitted: account.details_submitted ?? false,
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    requirements_due: [...new Set([...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])])],
  };
  const { error } = await admin.from('stripe_accounts').update(status).eq('stripe_account_id', accountId);
  if (error) throw error;
  return status;
}
