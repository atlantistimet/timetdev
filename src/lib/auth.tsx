import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import i18n, { supportedLanguages } from '@/i18n';
import { authErrorKey } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string;
  preferred_lang: string;
  adult_confirmed_at: string | null;
  is_seller: boolean;
};

const PROFILE_COLUMNS = 'id, full_name, preferred_lang, adult_confirmed_at, is_seller';

type SignUpInput = { fullName: string; email: string; password: string };
type SignUpResult = { errorKey: string | null; needsEmailConfirmation: boolean };

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  /** Vero finché non sappiamo se c'è una sessione e, se c'è, qual è il suo profilo. */
  isLoading: boolean;
  /** Il profilo non si è potuto caricare (rete o server): serve un nuovo tentativo. */
  profileError: boolean;
  /** Maggiore età dichiarata. Gli acquisti e la vendita richiedono questo valore anche lato server. */
  isAdultConfirmed: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  confirmAdult: () => Promise<string | null>;
  setLanguage: (lang: string) => Promise<void>;
  reloadProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  // Esito del caricamento del profilo, legato all'utente a cui appartiene.
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null; error: boolean } | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoaded(true);
    });
    // Nel callback non si chiamano altre funzioni di Supabase: si aggiorna solo lo stato.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoaded(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const adultDeclaredAtSignUp = session?.user.user_metadata?.adult_confirmed === true;

  useEffect(() => {
    if (!sessionLoaded || !userId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setLoaded({ userId, profile: null, error: true });
        return;
      }
      let next = data as Profile;
      // Chi ha spuntato il 18+ alla registrazione non deve ripeterlo al primo accesso
      // (succede quando la conferma email è attiva e la sessione nasce dopo).
      if (!next.adult_confirmed_at && adultDeclaredAtSignUp) {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ adult_confirmed_at: now })
          .eq('id', userId);
        if (!active) return;
        if (!updateError) next = { ...next, adult_confirmed_at: now };
      }
      setLoaded({ userId, profile: next, error: false });
      if (next.preferred_lang !== i18n.language && supportedLanguages.includes(next.preferred_lang)) {
        void i18n.changeLanguage(next.preferred_lang);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionLoaded, userId, adultDeclaredAtSignUp, reloadCounter]);

  const updateProfile = useCallback((changes: Partial<Profile>) => {
    setLoaded((current) =>
      current?.profile ? { ...current, profile: { ...current.profile, ...changes } } : current,
    );
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return authErrorKey(error);
  }, []);

  const signUp = useCallback(async ({ fullName, email, password }: SignUpInput): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // handle_new_user() usa full_name e lang per creare il profilo.
        data: { full_name: fullName.trim(), lang: i18n.language, adult_confirmed: true },
      },
    });
    const errorKey = authErrorKey(error);
    return { errorKey, needsEmailConfirmation: !errorKey && !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const confirmAdult = useCallback(async () => {
    if (!userId) return 'errors.generic';
    const now = new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ adult_confirmed_at: now }).eq('id', userId);
    if (error) return 'errors.generic';
    updateProfile({ adult_confirmed_at: now });
    return null;
  }, [userId, updateProfile]);

  const setLanguage = useCallback(
    async (lang: string) => {
      if (!supportedLanguages.includes(lang)) return;
      await i18n.changeLanguage(lang);
      if (!userId) return;
      const { error } = await supabase.from('profiles').update({ preferred_lang: lang }).eq('id', userId);
      if (!error) updateProfile({ preferred_lang: lang });
    },
    [userId, updateProfile],
  );

  const reloadProfile = useCallback(() => {
    setLoaded(null);
    setReloadCounter((n) => n + 1);
  }, []);

  // Il profilo vale solo se appartiene all'utente della sessione corrente.
  const current = loaded && loaded.userId === userId ? loaded : null;
  const profile = current?.profile ?? null;
  const profileError = current?.error ?? false;
  const isLoading = !sessionLoaded || (userId !== null && current === null);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      profileError,
      isAdultConfirmed: !!profile?.adult_confirmed_at,
      signIn,
      signUp,
      signOut,
      confirmAdult,
      setLanguage,
      reloadProfile,
    }),
    [
      session,
      profile,
      isLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      confirmAdult,
      setLanguage,
      reloadProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return context;
}
