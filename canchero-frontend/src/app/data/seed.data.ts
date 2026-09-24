import type {
  Cancha,
  Pago,
  Reserva,
  Sede,
  Usuario,
} from '../models/supabase.types';

const TS = '2026-09-23T14:00:00.000Z';

export const SEED_USUARIOS: Usuario[] = [
  {
    id: 1,
    nombre: 'Dueño Magdalena',
    email: 'dueno@canchero.pe',
    password_hash: '123456',
    telefono: '987 654 322',
    rol: 'dueno',
    activo: true,
    creado_en: TS,
    actualizado_en: TS,
  },
  {
    id: 2,
    nombre: 'Carlos Jugador',
    email: 'jugador@canchero.pe',
    password_hash: '123456',
    telefono: '987 654 321',
    rol: 'cliente',
    activo: true,
    creado_en: TS,
    actualizado_en: TS,
  },
];

export const SEED_SEDES: Sede[] = [
  {
    id: 1,
    dueno_id: 1,
    nombre: 'Complejo Deportivo Cancha Magdalena',
    direccion: 'Av. Costanera 123',
    distrito: 'Magdalena del Mar',
    ciudad: 'Lima',
    descripcion:
      'Complejo deportivo frente a la costanera con canchas de césped sintético, iluminación LED y zona de descanso.',
    imagen_url: 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=1200&auto=format&fit=crop',
    telefono: '987 654 322',
    rating: 4.8,
    banco: 'BCP',
    cuenta_bancaria: '193-4829104-0-12',
    cci: '002-193-004829104012-14',
    titular_cuenta: 'Canchas Magdalena S.A.C.',
    ruc_facturacion: '20608941231',
    activo: true,
    creado_en: TS,
    actualizado_en: TS,
    creado_por: 1,
  },
];

export const SEED_CANCHAS: Cancha[] = [
  {
    id: 1,
    sede_id: 1,
    nombre: 'Grass 7 - Cancha Principal',
    tipo: 'Grass 7',
    superficie: 'Césped sintético 50mm',
    precio_hora: 120,
    precio_hora_noche: 140,
    activa: true,
    foto_url:
      'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop',
    equipamiento: ['6 torres LED', '2 bancas de suplentes', 'Grabación VAR Pichanga'],
    creado_en: TS,
    actualizado_en: TS,
    creado_por: 1,
  },
  {
    id: 2,
    sede_id: 1,
    nombre: 'Grass 5 - Techada A',
    tipo: 'Grass 5',
    superficie: 'Césped monofilamento',
    precio_hora: 90,
    precio_hora_noche: 95,
    activa: true,
    foto_url:
      'https://images.unsplash.com/photo-1574629810360-7efbb6b04840?q=80&w=800&auto=format&fit=crop',
    equipamiento: ['Techo acústico', 'Arcos con malla de nylon', 'Aislamiento térmico'],
    creado_en: TS,
    actualizado_en: TS,
    creado_por: 1,
  },
  {
    id: 3,
    sede_id: 1,
    nombre: 'Grass 5 - Techada B',
    tipo: 'Grass 5',
    superficie: 'Césped sintético alta densidad',
    precio_hora: 85,
    precio_hora_noche: 90,
    activa: true,
    foto_url:
      'https://images.unsplash.com/photo-1518604666860-9ed391f76460?q=80&w=800&auto=format&fit=crop',
    equipamiento: ['Cercado perimétrico', 'Zona de graderías'],
    creado_en: TS,
    actualizado_en: TS,
    creado_por: 1,
  },
  {
    id: 4,
    sede_id: 1,
    nombre: 'Grass 6 - Futsal Nocturno',
    tipo: 'Grass 6',
    superficie: 'Césped sintético futsal',
    precio_hora: 100,
    precio_hora_noche: 110,
    activa: true,
    foto_url:
      'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?q=80&w=800&auto=format&fit=crop',
    equipamiento: ['Iluminación LED nocturna', 'Marcador digital'],
    creado_en: TS,
    actualizado_en: TS,
    creado_por: 1,
  },
];

export const SEED_RESERVAS: Reserva[] = [
  {
    id: 1,
    cancha_id: 1,
    usuario_id: 2,
    fecha: '2026-09-23',
    hora_inicio: '19:00',
    hora_fin: '20:00',
    estado: 'pendiente',
    codigo_pase: '#CAN-8841',
    creado_en: TS,
    actualizado_en: TS,
  },
  {
    id: 2,
    cancha_id: 2,
    usuario_id: 2,
    fecha: '2026-09-25',
    hora_inicio: '20:00',
    hora_fin: '21:00',
    estado: 'pendiente',
    codigo_pase: '#CAN-8842',
    creado_en: TS,
    actualizado_en: TS,
  },
];

const COMISION_PORCENTAJE = 0.05;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export const SEED_PAGOS: Pago[] = [
  {
    id: 1,
    reserva_id: 1,
    monto: 96,
    comision_plataforma: round2(96 * COMISION_PORCENTAJE),
    monto_neto_dueno: round2(96 * (1 - COMISION_PORCENTAJE)),
    metodo_pago: 'Yape',
    estado: 'completado',
    codigo_operacion: '94821039',
    estado_liquidacion: 'pendiente',
    fecha_pago: '2026-09-23',
    creado_en: TS,
    actualizado_en: TS,
  },
  {
    id: 2,
    reserva_id: 2,
    monto: 85,
    comision_plataforma: round2(85 * COMISION_PORCENTAJE),
    monto_neto_dueno: round2(85 * (1 - COMISION_PORCENTAJE)),
    metodo_pago: 'Plin',
    estado: 'completado',
    codigo_operacion: '83021944',
    estado_liquidacion: 'transferido',
    fecha_pago: '2026-09-24',
    creado_en: TS,
    actualizado_en: TS,
  },
];