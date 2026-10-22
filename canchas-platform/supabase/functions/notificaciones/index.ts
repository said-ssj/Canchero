// Edge Function: Notificaciones
// FCM Push, Twilio WhatsApp/SMS, SendGrid Email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createSupabaseClient, verifyAuth, jsonResponse, errorResponse } from '../_shared/index.ts';

interface NotificationRequest {
  usuario_id: string;
  tipo: 'reserva_creada' | 'reserva_confirmada' | 'reserva_cancelada' | 'pago_recibido' | 'recordatorio' | 'review_solicitada' | 'liquidacion_lista';
  titulo: string;
  mensaje: string;
  datos?: Record<string, any>;
  canales?: ('push' | 'email' | 'whatsapp')[];
}

interface FCMPayload {
  to: string;
  notification: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
}

serve(async (req: Request) => {
  const cors = await handleCors(req);
  if (cors) return cors;

  const supabase = await createSupabaseClient();
  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    switch (path) {
      case 'enviar': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const body: NotificationRequest = await req.json();
        const canales = body.canales || ['push', 'email'];
        const results: Record<string, any> = {};
        
        // Obtener datos de contacto del usuario real.
        const { data: user } = await supabase
          .from('usuario')
          .select('correo, telefono')
          .eq('id_usuario', body.usuario_id)
          .single();
        
        if (!user) return errorResponse('Usuario no encontrado', 404);
        
        // 1. Push queda pendiente hasta que exista una columna/token de dispositivo en usuario.
        if (canales.includes('push')) {
          results.push = { skipped: true, reason: 'No hay token push conectado en el esquema actual.' };
        }
        
        // 2. Email (SendGrid)
        if (canales.includes('email') && user.correo) {
          results.email = await sendEmail(user.correo, body);
        }
        
        // 3. WhatsApp (Twilio)
        if (canales.includes('whatsapp') && user.telefono) {
          results.whatsapp = await sendWhatsApp(user.telefono, body);
        }
        
        // No se guarda in-app porque la tabla public.notificacion no existe en el esquema actual.
        
        return jsonResponse({ success: true, results });
      }
      
      case 'push': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const { token, titulo, mensaje, data } = await req.json();
        const result = await sendPushNotification(token, { titulo, mensaje, datos: data });
        return jsonResponse(result);
      }
      
      case 'topic': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        return errorResponse('El envío de notificaciones por topic aún no está implementado.', 501);
      }
      
      default:
        return errorResponse('Endpoint not found', 404);
    }
  } catch (err) {
    console.error('Notificaciones error:', err);
    return errorResponse(err.message, 500);
  }
});

async function sendPushNotification(token: string, body: NotificationRequest): Promise<any> {
  const serverKey = Deno.env.get('FCM_SERVER_KEY');
  if (!serverKey) return { error: 'FCM not configured' };
  
  const payload: FCMPayload = {
    to: token,
    notification: {
      title: body.titulo,
      body: body.mensaje,
    },
    data: body.datos ? Object.fromEntries(
      Object.entries(body.datos).map(([k, v]) => [k, String(v)])
    ) : {},
  };
  
  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  return response.json();
}

async function sendEmail(email: string, body: NotificationRequest): Promise<any> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@canchero.pe';
  
  if (!apiKey) return { error: 'SendGrid not configured' };
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3CB043;">${body.titulo}</h2>
      <p>${body.mensaje}</p>
      ${body.datos ? `<pre>${JSON.stringify(body.datos, null, 2)}</pre>` : ''}
      <hr>
      <p style="color: #666; font-size: 12px;">Canchero - Tu cancha, tu juego</p>
    </div>
  `;
  
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }], subject: body.titulo }],
      from: { email: fromEmail, name: 'Canchero' },
      content: [{ type: 'text/html', value: html }],
    }),
  });
  
  return response.ok ? { success: true } : { error: await response.text() };
}

async function sendWhatsApp(telefono: string, body: NotificationRequest): Promise<any> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';
  
  if (!accountSid || !authToken) return { error: 'Twilio not configured' };
  
  const toNumber = `whatsapp:+51${telefono.replace(/\D/g, '')}`;
  
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: `${body.titulo}\n\n${body.mensaje}`,
    }),
  });
  
  return response.ok ? { success: true } : { error: await response.text() };
}
