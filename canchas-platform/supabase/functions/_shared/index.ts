// Shared utilities for Edge Functions
// CORS, Auth helpers, Supabase client

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export async function handleCors(req: Request): Promise<Response | null> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export async function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  // Usar createClient de @supabase/supabase-js
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function verifyAuth(req: Request, supabase: Awaited<ReturnType<typeof createSupabaseClient>>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { error: 'Missing authorization header', status: 401 };
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return { error: 'Invalid token', status: 401 };
  }
  
  return { user };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}