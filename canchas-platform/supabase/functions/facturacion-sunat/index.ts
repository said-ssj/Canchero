// Edge Function: Facturación SUNAT
// Emisión de comprobantes electrónicos (boleta/factura) XML UBL 2.1

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
      case 'emitir': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        return errorResponse('La emisión real de comprobantes SUNAT aún no está implementada.', 501);
      }
      
      case 'consultar': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        return errorResponse('La consulta de comprobantes SUNAT aún no está implementada.', 501);
      }
      
      case 'pdf': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        return errorResponse('La generación de PDF SUNAT aún no está implementada.', 501);
      }
      
      default:
        return errorResponse('Endpoint not found', 404);
    }
  } catch (err) {
    console.error('Facturación SUNAT error:', err);
    return errorResponse(err.message, 500);
  }
});