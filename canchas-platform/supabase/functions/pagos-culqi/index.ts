// Edge Function: Pagos Culqi
// Maneja cargos, webhooks, reembolsos

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createSupabaseClient, verifyAuth, errorResponse } from '../_shared/index.ts';

serve(async (req: Request) => {
  const cors = await handleCors(req);
  if (cors) return cors;

  const supabase = await createSupabaseClient();
  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    switch (path) {
      case 'charge': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        return errorResponse('El procesamiento de pagos Culqi aún no está implementado.', 501);
      }
      
      case 'webhook': {
        return errorResponse('El webhook de Culqi no está habilitado hasta validar su firma.', 501);
      }
      
      case 'refund': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        return errorResponse('Los reembolsos de Culqi aún no están implementados.', 501);
      }
      
      default:
        return errorResponse('Endpoint not found', 404);
    }
  } catch (err) {
    console.error('Pagos Culqi error:', err);
    return errorResponse(err.message, 500);
  }
});