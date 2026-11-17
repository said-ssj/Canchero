import { supabaseConfiguration } from './environment.local';

export const environment = {
  sentryEnabled: (supabaseConfiguration as any).sentryEnabled === true,
  sentryDsn: (supabaseConfiguration as any).sentryFrontendDsn || '',
  appEnvironment: (supabaseConfiguration as any).appEnvironment || 'development',
  appRelease: (supabaseConfiguration as any).appRelease || '',
  production: false,
  supabaseUrl: supabaseConfiguration.url,
  supabaseAnonKey: supabaseConfiguration.anonKey,
  googleAuthEnabled: supabaseConfiguration.googleAuthEnabled,
  googleClientId: ((supabaseConfiguration as any).googleClientId as string) || '',
  googleMapsApiKey: (supabaseConfiguration as any).googleMapsApiKey || '',
  apiUrl: (supabaseConfiguration as any).apiUrl || 'http://localhost:8080/api',
  business: supabaseConfiguration.business,
  isDemoMode: false,
};
