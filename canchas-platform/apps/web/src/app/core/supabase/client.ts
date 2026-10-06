import { createClient } from '@supabase/supabase-js';
import { environment } from '@env/environment';

export const supabase = createClient(
  environment.supabaseUrl,
  environment.supabaseAnonKey
);