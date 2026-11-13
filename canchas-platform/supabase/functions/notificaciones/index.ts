// Edge Function: Notificaciones
// FCM Push, Twilio WhatsApp/SMS, SendGrid Email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createSupabaseClient, jsonResponse, errorResponse } from '../_shared/index.ts';

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

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return errorResponse('Servicio de notificaciones no configurado', 503);
  if (!isTrustedServiceRequest(req, serviceKey)) return errorResponse('No autorizado', 401);

  const supabase = await createSupabaseClient();
  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    switch (path) {
      case 'enviar': {
        const body = await req.json() as Partial<NotificationRequest>;
        if (!isNotificationRequest(body)) return errorResponse('Solicitud de notificación inválida', 400);
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
        const { token, titulo, mensaje, data } = await req.json();
        if (typeof token !== 'string' || token.length > 4096 || typeof titulo !== 'string'
            || titulo.length > 120 || typeof mensaje !== 'string' || mensaje.length > 2000)
          return errorResponse('Solicitud push inválida', 400);
        const result = await sendPushNotification(token, { titulo, mensaje, datos: data });
        return jsonResponse(result);
      }
      
      case 'topic': {
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

function isTrustedServiceRequest(req: Request, serviceKey: string): boolean {
  const authorization = req.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return false;
  const candidate = new TextEncoder().encode(match[1]);
  const expected = new TextEncoder().encode(serviceKey);
  let difference = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);
  for (let i = 0; i < length; i++) difference |= (candidate[i] ?? 0) ^ (expected[i] ?? 0);
  return difference === 0;
}

function isNotificationRequest(body: Partial<NotificationRequest>): body is NotificationRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const allowedTypes = new Set([
    'reserva_creada', 'reserva_confirmada', 'reserva_cancelada', 'pago_recibido',
    'recordatorio', 'review_solicitada', 'liquidacion_lista',
  ]);
  const allowedChannels = new Set(['push', 'email', 'whatsapp']);
  return typeof body.usuario_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.usuario_id)
    && typeof body.tipo === 'string' && allowedTypes.has(body.tipo)
    && typeof body.titulo === 'string' && body.titulo.trim().length > 0 && body.titulo.length <= 120
    && typeof body.mensaje === 'string' && body.mensaje.trim().length > 0 && body.mensaje.length <= 2000
    && (body.canales === undefined || (Array.isArray(body.canales)
      && body.canales.length > 0 && body.canales.every((channel) => allowedChannels.has(channel))));
}

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
  
  const safeTitle = escapeHtml(body.titulo);
  const safeMessage = escapeHtml(body.mensaje);
  const safeData = body.datos ? escapeHtml(JSON.stringify(body.datos, null, 2)) : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3CB043;">${safeTitle}</h2>
      <p>${safeMessage}</p>
      ${safeData ? `<pre>${safeData}</pre>` : ''}
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

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}
