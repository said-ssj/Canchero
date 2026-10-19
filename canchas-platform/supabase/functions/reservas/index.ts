// Edge Function: Reservas - Disponibilidad tiempo real, bloqueos, lógica de negocio

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createSupabaseClient, verifyAuth, jsonResponse, errorResponse } from '../_shared/index.ts';

interface AvailabilityRequest {
  sede_id: number;
  fecha: string;        // YYYY-MM-DD
  cancha_ids?: number[];
}

interface AvailabilityResponse {
  cancha_id: number;
  nombre: string;
  tipo: string;
  precio_hora: number;
  precio_hora_noche: number;
  slots: TimeSlot[];
}

interface TimeSlot {
  hora_inicio: string;  // HH:MM
  hora_fin: string;     // HH:MM
  disponible: boolean;
  bloqueado: boolean;
  motivo_bloqueo?: string;
  reserva_id?: number;
}

interface BlockRequest {
  cancha_id: number;
  fecha_inicio: string; // ISO timestamp
  fecha_fin: string;    // ISO timestamp
  motivo: string;
  recurrente?: boolean;
  dia_semana?: number;
}

serve(async (req: Request) => {
  const cors = await handleCors(req);
  if (cors) return cors;

  const supabase = await createSupabaseClient();
  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    switch (path) {
      case 'disponibilidad': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const body: AvailabilityRequest = await req.json();
        const disponibilidad = await getDisponibilidad(supabase, body);
        return jsonResponse(disponibilidad);
      }
      
      case 'bloquear': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const body: BlockRequest = await req.json();
        const bloqueo = await crearBloqueo(supabase, body, auth.user.id);
        return jsonResponse(bloqueo);
      }
      
      case 'desbloquear': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const { bloqueo_id } = await req.json();
        const { error } = await supabase
          .from('bloqueo_mantenimiento')
          .delete()
          .eq('id_bloqueo', bloqueo_id);
        
        if (error) throw error;
        return jsonResponse({ success: true });
      }
      
      case 'crear-reserva': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const { cancha_id, cliente_id, fecha, hora_inicio, hora_fin, monto } = await req.json();
        
        // Verificar disponibilidad en tiempo real
        const disponible = await verificarDisponibilidad(supabase, cancha_id, fecha, hora_inicio, hora_fin);
        if (!disponible) {
          return errorResponse('Horario no disponible', 409);
        }
        
        const idCliente = cliente_id || await getClienteId(supabase, auth.user.id);
        if (!idCliente) return errorResponse('No existe un cliente vinculado al usuario autenticado', 400);

        // Crear reserva pendiente
        const { data: reserva, error } = await supabase
          .from('reserva')
          .insert({
            id_cancha: cancha_id,
            id_cliente: idCliente,
            id_estado_reserva: 1,
            id_usuario: auth.user.id,
            fecha_reserva: fecha,
            hora_inicio,
            hora_fin,
            monto_total: Number(monto || 0),
            adelanto: 0,
            saldo: Number(monto || 0),
            estado: 'A',
            codigo_pase: `#CAN-${Math.floor(1000 + Math.random() * 9000)}`,
            usucre: 'EDGE',
            pccre: 'SUPABASE',
          })
          .select()
          .single();
        
        if (error) throw error;
        
        return jsonResponse(reserva);
      }
      
      case 'confirmar-reserva': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const { reserva_id } = await req.json();
        
        // Solo dueño de la cancha puede confirmar
        const { data: reserva } = await supabase
          .from('reserva')
          .select('id_cliente, id_usuario, cancha:id_cancha(sede:id_sede(id_dueno))')
          .eq('id_reserva', reserva_id)
          .single();
        
        if (reserva?.cancha?.sede?.id_dueno !== auth.user.id) {
          return errorResponse('No autorizado', 403);
        }
        
        const { data, error } = await supabase
          .from('reserva')
          .update({ id_estado_reserva: 2, fecmod: new Date().toISOString(), usmod: 'EDGE' })
          .eq('id_reserva', reserva_id)
          .select()
          .single();
        
        if (error) throw error;
        
        // Notificar al jugador
        await supabase.functions.invoke('notificaciones/enviar', {
          body: {
            usuario_id: data.id_usuario,
            tipo: 'reserva_confirmada',
            titulo: 'Reserva confirmada',
            mensaje: `Tu reserva para ${data.fecha_reserva} de ${data.hora_inicio} a ${data.hora_fin} ha sido confirmada.`,
            datos: { reserva_id: data.id_reserva },
          },
        });
        
        return jsonResponse(data);
      }
      
      case 'cancelar-reserva': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        const { reserva_id, motivo } = await req.json();
        
        // Verificar permisos (jugador dueño o dueño de cancha)
        const { data: reserva } = await supabase
          .from('reserva')
          .select('id_cliente, id_usuario, cancha:id_cancha(sede:id_sede(id_dueno))')
          .eq('id_reserva', reserva_id)
          .single();
        
        const clienteId = await getClienteId(supabase, auth.user.id);
        const esJugador = reserva?.id_usuario === auth.user.id || reserva?.id_cliente === clienteId;
        const esDueno = reserva?.cancha?.sede?.id_dueno === auth.user.id;
        
        if (!esJugador && !esDueno) {
          return errorResponse('No autorizado', 403);
        }
        
        const { data, error } = await supabase
          .from('reserva')
          .update({ id_estado_reserva: 3, fecmod: new Date().toISOString(), usmod: 'EDGE' })
          .eq('id_reserva', reserva_id)
          .select()
          .single();
        
        if (error) throw error;
        
        // Si hay pago, procesar reembolso
        if (esDueno && motivo) {
          await supabase.functions.invoke('pagos-culqi/refund', {
            body: { reserva_id, motivo },
          });
        }
        
        return jsonResponse(data);
      }
      
      case 'lista-espera': {
        const auth = await verifyAuth(req, supabase);
        if ('error' in auth) return errorResponse(auth.error, auth.status);
        
        return errorResponse('La lista de espera aún no está implementada.', 501);
      }
      
      default:
        return errorResponse('Endpoint not found', 404);
    }
  } catch (err) {
    console.error('Reservas error:', err);
    return errorResponse(err.message, 500);
  }
});

async function getDisponibilidad(supabase: any, req: AvailabilityRequest): Promise<AvailabilityResponse[]> {
  const { fecha, cancha_ids } = req;
  
  // Obtener canchas de la sede
  let query = supabase
    .from('cancha')
    .select('id_cancha, nombre_numero, id_tipo_cancha')
    .eq('id_sede', req.sede_id)
    .eq('estado', 'A');
  
  if (cancha_ids?.length) {
    query = query.in('id_cancha', cancha_ids);
  }
  
  const { data: canchas, error } = await query;
  if (error) throw error;
  
  // Obtener reservas del día
  const { data: reservas } = await supabase
    .from('reserva')
    .select('id_reserva, id_cancha, hora_inicio, hora_fin')
    .in('id_cancha', canchas.map(c => c.id_cancha))
    .eq('fecha_reserva', fecha)
    .in('id_estado_reserva', [1, 2])
    .eq('estado', 'A');
  
  // Obtener bloqueos del día
  const { data: bloqueos } = await supabase
    .from('bloqueo_mantenimiento')
    .select('id_cancha, fecha_inicio, fecha_fin, motivo')
    .lte('fecha_inicio', `${fecha}T23:59:59`)
    .gte('fecha_fin', `${fecha}T00:00:00`);
  
  // Generar slots de 1 hora (6:00 - 23:00)
  const slots = generateTimeSlots(6, 23);
  
  return canchas.map(cancha => {
    const canchaReservas = reservas?.filter(r => r.id_cancha === cancha.id_cancha) || [];
    const canchaBloqueos = bloqueos?.filter(b => b.id_cancha === cancha.id_cancha) || [];
    
    return {
      cancha_id: cancha.id_cancha,
      nombre: cancha.nombre_numero,
      tipo: `Tipo ${cancha.id_tipo_cancha}`,
      precio_hora: 0,
      precio_hora_noche: 0,
      slots: slots.map(slot => {
        const horaInicio = slot.inicio;
        const horaFin = slot.fin;
        
        // Verificar reserva
        const reserva = canchaReservas.find(r => 
          r.hora_inicio <= horaInicio && r.hora_fin > horaInicio
        );
        
        // Verificar bloqueo
        const bloqueo = canchaBloqueos.find(b => {
          const inicio = new Date(b.fecha_inicio);
          const fin = new Date(b.fecha_fin);
          const slotInicio = new Date(`${fecha}T${horaInicio}:00`);
          return slotInicio >= inicio && slotInicio < fin;
        });
        
        return {
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          disponible: !reserva && !bloqueo,
          bloqueado: !!bloqueo,
          motivo_bloqueo: bloqueo?.motivo,
          reserva_id: reserva?.id_reserva,
        };
      }),
    };
  });
}

function generateTimeSlots(inicio: number, fin: number): { inicio: string; fin: string }[] {
  const slots = [];
  for (let h = inicio; h < fin; h++) {
    const inicioStr = h.toString().padStart(2, '0') + ':00';
    const finStr = (h + 1).toString().padStart(2, '0') + ':00';
    slots.push({ inicio: inicioStr, fin: finStr });
  }
  return slots;
}

async function verificarDisponibilidad(supabase: any, cancha_id: number, fecha: string, hora_inicio: string, hora_fin: string): Promise<boolean> {
  const { data: reserva } = await supabase
    .from('reserva')
    .select('id_reserva')
    .eq('id_cancha', cancha_id)
    .eq('fecha_reserva', fecha)
    .lt('hora_inicio', hora_fin)
    .gt('hora_fin', hora_inicio)
    .in('id_estado_reserva', [1, 2])
    .eq('estado', 'A')
    .maybeSingle();
  
  if (reserva) return false;
  
  const { data: bloqueo } = await supabase
    .from('bloqueo_mantenimiento')
    .select('id_bloqueo')
    .eq('id_cancha', cancha_id)
    .lte('fecha_inicio', `${fecha}T${hora_fin}:00`)
    .gte('fecha_fin', `${fecha}T${hora_inicio}:00`)
    .maybeSingle();
  
  return !bloqueo;
}

async function crearBloqueo(supabase: any, req: BlockRequest, userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('bloqueo_mantenimiento')
    .insert({
      id_cancha: req.cancha_id,
      motivo: req.motivo,
      fecha_inicio: req.fecha_inicio,
      fecha_fin: req.fecha_fin,
      estado: 'A',
      usucre: userId,
      pccre: 'SUPABASE',
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getClienteId(supabase: any, authUid: string): Promise<string | null> {
  const { data } = await supabase
    .from('cliente')
    .select('id_cliente')
    .eq('id_usuario', authUid)
    .maybeSingle();
  return data?.id_cliente || null;
}
