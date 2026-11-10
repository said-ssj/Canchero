import { createClient } from '@supabase/supabase-js';
import { environment } from '@env/environment';

export const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

let googleClient: ReturnType<typeof createClient> | undefined;

export function googleOAuthClient() {
  if (googleClient) return googleClient;
  googleClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      storageKey: 'canchero-google-auth',
      detectSessionInUrl: false,
      autoRefreshToken: false,
      storage: {
        getItem: (key) => sessionStorage.getItem(key),
        setItem: (key, value) => sessionStorage.setItem(key, value),
        removeItem: (key) => sessionStorage.removeItem(key),
      },
    },
  });
  return googleClient;
}
