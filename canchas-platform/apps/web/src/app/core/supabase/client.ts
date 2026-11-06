import { createClient } from '@supabase/supabase-js';
import { environment } from '@env/environment';

export const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

let googleClient: ReturnType<typeof createClient> | undefined;

export function googleOAuthClient() {
  if (googleClient) return googleClient;
  const transient = new Map<string, string>();
  googleClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      storageKey: 'canchero-google-auth',
      detectSessionInUrl: false,
      autoRefreshToken: false,
      storage: {
        getItem: (key) =>
          key.endsWith('-code-verifier')
            ? sessionStorage.getItem(key)
            : (transient.get(key) ?? null),
        setItem: (key, value) => {
          if (key.endsWith('-code-verifier')) sessionStorage.setItem(key, value);
          else transient.set(key, value);
        },
        removeItem: (key) => {
          if (key.endsWith('-code-verifier')) sessionStorage.removeItem(key);
          else transient.delete(key);
        },
      },
    },
  });
  return googleClient;
}
