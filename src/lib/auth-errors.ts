import type { AuthError } from '@supabase/supabase-js';

/** Traduce un errore di Supabase Auth nella chiave di traduzione da mostrare all'utente. */
export function authErrorKey(error: AuthError | null | undefined): string | null {
  if (!error) return null;
  switch (error.code) {
    case 'invalid_credentials':
      return 'auth.errors.invalidCredentials';
    case 'user_already_exists':
    case 'email_exists':
      return 'auth.errors.emailExists';
    case 'weak_password':
      return 'auth.errors.weakPassword';
    case 'email_not_confirmed':
      return 'auth.errors.emailNotConfirmed';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'auth.errors.rateLimit';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'auth.errors.emailInvalid';
    case 'signup_disabled':
      return 'auth.errors.signupDisabled';
    default:
      break;
  }
  if (error.name === 'AuthRetryableFetchError') return 'auth.errors.network';
  return 'errors.generic';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export const MIN_PASSWORD_LENGTH = 8;
