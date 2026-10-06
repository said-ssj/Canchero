// Supabase Database Types
// Generado automáticamente desde la DB con: supabase gen types typescript --local
// Este archivo se actualiza con: npm run db:generate:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      usuario: {
        Row: {
          id: number;
          auth_uid: string | null;
          nombre: string;
          email: string;
          password_hash: string | null;
          telefono: string | null;
          rol: 'cliente' | 'dueno' | 'operador' | 'admin' | 'caja';
          activo: boolean;
          fecha_nacimiento: string | null;
          documento_tipo: string | null;
          documento_numero: string | null;
          avatar_url: string | null;
          creado_en: string;
          actualizado_en: string;
          creado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['usuario']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['usuario']['Insert']>;
      };
      sede: {
        Row: {
          id: number;
          dueno_id: number;
          nombre: string;
          direccion: string;
          distrito: string;
          ciudad: string;
          descripcion: string | null;
          imagen_url: string | null;
          telefono: string | null;
          rating: number | null;
          banco: string | null;
          cuenta_bancaria: string | null;
          cci: string | null;
          titular_cuenta: string | null;
          ruc_facturacion: string | null;
          activo: boolean;
          latitud: number | null;
          longitud: number | null;
          creado_en: string;
          actualizado_en: string;
          creado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['sede']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['sede']['Insert']>;
      };
      cancha: {
        Row: {
          id: number;
          sede_id: number;
          nombre: string;
          tipo: 'Grass 7' | 'Grass 5' | 'Grass 6' | 'Futsal' | 'Padel' | 'Tenis';
          superficie: 'cesped_sintetico' | 'cesped_natural' | 'cemento' | 'madera' | 'tatami';
          precio_hora: number;
          precio_hora_noche: number | null;
          activa: boolean;
          foto_url: string | null;
          equipamiento: Json;
          aforo_max: number | null;
          creado_en: string;
          actualizado_en: string;
          creado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['cancha']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['cancha']['Insert']>;
      };
      horario_atencion: {
        Row: {
          id: number;
          sede_id: number;
          dia_semana: number;
          hora_apertura: string;
          hora_cierre: string;
          activo: boolean;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['horario_atencion']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['horario_atencion']['Insert']>;
      };
      bloqueo_mantenimiento: {
        Row: {
          id: number;
          cancha_id: number;
          motivo: string;
          fecha_inicio: string;
          fecha_fin: string;
          recurrente: boolean;
          dia_semana: number | null;
          creado_en: string;
          creado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['bloqueo_mantenimiento']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['bloqueo_mantenimiento']['Insert']>;
      };
      reserva: {
        Row: {
          id: number;
          cancha_id: number;
          usuario_id: number;
          fecha: string;
          hora_inicio: string;
          hora_fin: string;
          estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';
          codigo_pase: string;
          notas: string | null;
          check_in_en: string | null;
          check_out_en: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['reserva']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['reserva']['Insert']>;
      };
      pago: {
        Row: {
          id: number;
          reserva_id: number;
          monto: number;
          comision_plataforma: number;
          monto_neto_dueno: number;
          metodo_pago: string;
          estado: 'pendiente' | 'completado' | 'fallido' | 'reembolsado';
          codigo_operacion: string | null;
          comprobante_url: string | null;
          estado_liquidacion: 'pendiente' | 'transferido' | 'fallido';
          fecha_pago: string;
          culqi_charge_id: string | null;
          culqi_refund_id: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['pago']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['pago']['Insert']>;
      };
      plan_suscripcion: {
        Row: {
          id: number;
          nombre: 'basico' | 'pro' | 'elite';
          descripcion: string | null;
          precio_mensual: number;
          precio_anual: number | null;
          descuento_reserva_pct: number;
          max_reservas_mes: number | null;
          prioridad_soporte: number;
          features: Json;
          activo: boolean;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['plan_suscripcion']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['plan_suscripcion']['Insert']>;
      };
      suscripcion: {
        Row: {
          id: number;
          usuario_id: number;
          plan_id: number;
          estado: string;
          fecha_inicio: string;
          fecha_fin: string | null;
          renovacion_auto: boolean;
          metodo_pago: string | null;
          culqi_subscription_id: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['suscripcion']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['suscripcion']['Insert']>;
      };
      pago_suscripcion: {
        Row: {
          id: number;
          suscripcion_id: number;
          monto: number;
          estado: 'pendiente' | 'completado' | 'fallido' | 'reembolsado';
          fecha_pago: string;
          culqi_charge_id: string | null;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['pago_suscripcion']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['pago_suscripcion']['Insert']>;
      };
      caja: {
        Row: {
          id: number;
          sede_id: number;
          nombre: string;
          descripcion: string | null;
          activo: boolean;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['caja']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['caja']['Insert']>;
      };
      sesion_caja: {
        Row: {
          id: number;
          caja_id: number;
          operador_id: number;
          fondo_inicial: number;
          fondo_final: number | null;
          estado: string;
          abierta_en: string;
          cerrada_en: string | null;
          diferencia: number | null;
          observaciones: string | null;
        };
        Insert: Omit<Database['public']['Tables']['sesion_caja']['Row'], 'id' | 'abierta_en'>;
        Update: Partial<Database['public']['Tables']['sesion_caja']['Insert']>;
      };
      tipo_movimiento_caja: {
        Row: {
          id: number;
          nombre: string;
          tipo: 'entrada' | 'salida';
          descripcion: string | null;
          afecta_arqueo: boolean;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['tipo_movimiento_caja']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['tipo_movimiento_caja']['Insert']>;
      };
      movimiento_caja: {
        Row: {
          id: number;
          sesion_caja_id: number;
          tipo_movimiento_id: number;
          monto: number;
          concepto: string | null;
          referencia_id: number | null;
          referencia_tipo: string | null;
          creado_en: string;
          creado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['movimiento_caja']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['movimiento_caja']['Insert']>;
      };
      arqueo_caja: {
        Row: {
          id: number;
          sesion_caja_id: number;
          total_sistema: number;
          total_fisico: number;
          diferencia: number;
          observaciones: string | null;
          realizado_en: string;
          realizado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['arqueo_caja']['Row'], 'id' | 'realizado_en'>;
        Update: Partial<Database['public']['Tables']['arqueo_caja']['Insert']>;
      };
      denominacion: {
        Row: {
          id: number;
          valor: number;
          tipo: string;
          descripcion: string | null;
          orden: number;
        };
        Insert: Omit<Database['public']['Tables']['denominacion']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['denominacion']['Insert']>;
      };
      arqueo_detalle: {
        Row: {
          id: number;
          arqueo_id: number;
          denominacion_id: number;
          cantidad: number;
          subtotal: number;
        };
        Insert: Omit<Database['public']['Tables']['arqueo_detalle']['Row'], 'id' | 'subtotal'>;
        Update: Partial<Database['public']['Tables']['arqueo_detalle']['Insert']>;
      };
      tipo_implemento: {
        Row: {
          id: number;
          nombre: string;
          descripcion: string | null;
          requiere_garantia: boolean;
          garantia_monto: number;
          activo: boolean;
        };
        Insert: Omit<Database['public']['Tables']['tipo_implemento']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['tipo_implemento']['Insert']>;
      };
      implemento: {
        Row: {
          id: number;
          sede_id: number;
          tipo_id: number;
          codigo_interno: string | null;
          estado: string;
          observaciones: string | null;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['implemento']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['implemento']['Insert']>;
      };
      alquiler_implemento: {
        Row: {
          id: number;
          implemento_id: number;
          reserva_id: number | null;
          usuario_id: number;
          fecha_inicio: string;
          fecha_fin: string | null;
          garantia_retenida: number;
          estado: string;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['alquiler_implemento']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['alquiler_implemento']['Insert']>;
      };
      categoria_producto: {
        Row: {
          id: number;
          nombre: string;
          descripcion: string | null;
          activo: boolean;
        };
        Insert: Omit<Database['public']['Tables']['categoria_producto']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['categoria_producto']['Insert']>;
      };
      producto: {
        Row: {
          id: number;
          sede_id: number;
          categoria_id: number | null;
          nombre: string;
          descripcion: string | null;
          sku: string | null;
          precio_venta: number;
          precio_costo: number | null;
          stock_actual: number;
          stock_minimo: number;
          unidad_medida: string;
          codigo_barras: string | null;
          activo: boolean;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['producto']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['producto']['Insert']>;
      };
      tipo_movimiento_inv: {
        Row: {
          id: number;
          nombre: string;
          tipo: 'compra' | 'venta' | 'ajuste' | 'merma' | 'traslado';
          signo: number;
          descripcion: string | null;
        };
        Insert: Omit<Database['public']['Tables']['tipo_movimiento_inv']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['tipo_movimiento_inv']['Insert']>;
      };
      kardex: {
        Row: {
          id: number;
          producto_id: number;
          tipo_movimiento_id: number;
          cantidad: number;
          stock_anterior: number;
          stock_nuevo: number;
          costo_unitario: number | null;
          costo_total: number | null;
          referencia_id: number | null;
          referencia_tipo: string | null;
          observaciones: string | null;
          creado_en: string;
          creado_por: number | null;
        };
        Insert: Omit<Database['public']['Tables']['kardex']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['kardex']['Insert']>;
      };
      equipo: {
        Row: {
          id: number;
          sede_id: number;
          nombre: string;
          categoria: string | null;
          capitan_id: number;
          color_camiseta: string | null;
          logo_url: string | null;
          activo: boolean;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['equipo']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['equipo']['Insert']>;
      };
      miembro_equipo: {
        Row: {
          id: number;
          equipo_id: number;
          usuario_id: number;
          rol: string;
          numero_camiseta: number | null;
          activo: boolean;
          unido_en: string;
        };
        Insert: Omit<Database['public']['Tables']['miembro_equipo']['Row'], 'id' | 'unido_en'>;
        Update: Partial<Database['public']['Tables']['miembro_equipo']['Insert']>;
      };
      equipo_partido: {
        Row: {
          id: number;
          liga_id: number | null;
          equipo_local_id: number;
          equipo_visitante_id: number;
          cancha_id: number | null;
          fecha: string;
          goles_local: number | null;
          goles_visitante: number | null;
          estado: string;
          arbitro_id: number | null;
          observaciones: string | null;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['equipo_partido']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['equipo_partido']['Insert']>;
      };
      review: {
        Row: {
          id: number;
          sede_id: number;
          usuario_id: number;
          reserva_id: number | null;
          puntuacion: number;
          comentario: string | null;
          verificada: boolean;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['review']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['review']['Insert']>;
      };
      venta: {
        Row: {
          id: number;
          sede_id: number;
          cliente_id: number | null;
          tipo_comprobante: string;
          serie: string;
          numero: number;
          fecha_emision: string;
          hora_emision: string;
          moneda: string;
          subtotal: number;
          igv: number;
          total: number;
          estado_sunat: string;
          sunat_response: Json | null;
          xml_hash: string | null;
          qr_code: string | null;
          pdf_url: string | null;
          observaciones: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['venta']['Row'], 'id' | 'creado_en' | 'actualizado_en'>;
        Update: Partial<Database['public']['Tables']['venta']['Insert']>;
      };
      venta_detalle: {
        Row: {
          id: number;
          venta_id: number;
          producto_id: number | null;
          descripcion: string;
          cantidad: number;
          precio_unitario: number;
          descuento: number;
          igv: number;
          total: number;
          afectacion_igv: string;
        };
        Insert: Omit<Database['public']['Tables']['venta_detalle']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['venta_detalle']['Insert']>;
      };
      auditoria: {
        Row: {
          id: number;
          tabla: string;
          registro_id: number;
          accion: string;
          datos_anteriores: Json | null;
          datos_nuevos: Json | null;
          usuario_id: number | null;
          ip_address: string | null;
          user_agent: string | null;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['auditoria']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['auditoria']['Insert']>;
      };
      notificacion: {
        Row: {
          id: number;
          usuario_id: number;
          tipo: string;
          titulo: string;
          mensaje: string;
          datos: Json | null;
          leida: boolean;
          leida_en: string | null;
          enviado_push: boolean;
          enviado_email: boolean;
          enviado_whatsapp: boolean;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['notificacion']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['notificacion']['Insert']>;
      };
      chat_conversacion: {
        Row: {
          id: number;
          reserva_id: number | null;
          sede_id: number | null;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['chat_conversacion']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['chat_conversacion']['Insert']>;
      };
      chat_mensaje: {
        Row: {
          id: number;
          conversacion_id: number;
          remitente_id: number;
          contenido: string;
          tipo: string;
          adjunto_url: string | null;
          leido: boolean;
          leido_en: string | null;
          creado_en: string;
        };
        Insert: Omit<Database['public']['Tables']['chat_mensaje']['Row'], 'id' | 'creado_en'>;
        Update: Partial<Database['public']['Tables']['chat_mensaje']['Insert']>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_current_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      get_current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: 'cliente' | 'dueno' | 'operador' | 'admin' | 'caja';
      };
      is_owner: {
        Args: { p_dueno_id: number };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: 'cliente' | 'dueno' | 'operador' | 'admin' | 'caja';
      booking_status: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';
      payment_status: 'pendiente' | 'completado' | 'fallido' | 'reembolsado';
      liquidation_status: 'pendiente' | 'transferido' | 'fallido';
      court_type: 'Grass 7' | 'Grass 5' | 'Grass 6' | 'Futsal' | 'Padel' | 'Tenis';
      surface_type: 'cesped_sintetico' | 'cesped_natural' | 'cemento' | 'madera' | 'tatami';
      subscription_plan: 'basico' | 'pro' | 'elite';
      movement_type: 'entrada' | 'salida';
      inventory_movement: 'compra' | 'venta' | 'ajuste' | 'merma' | 'traslado';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Tipos de conveniencia para uso en la app
export type Usuario = Database['public']['Tables']['usuario']['Row'];
export type Sede = Database['public']['Tables']['sede']['Row'];
export type Cancha = Database['public']['Tables']['cancha']['Row'];
export type Reserva = Database['public']['Tables']['reserva']['Row'];
export type Pago = Database['public']['Tables']['pago']['Row'];
export type Review = Database['public']['Tables']['review']['Row'];
export type Producto = Database['public']['Tables']['producto']['Row'];
export type Notificacion = Database['public']['Tables']['notificacion']['Row'];

// Tipos para joins comunes
export type ReservaConDetalles = Reserva & {
  cancha: Cancha;
  sede: Sede;
  usuario: Usuario;
  pago: Pago | null;
};

export type SedeConCanchas = Sede & {
  canchas: Cancha[];
};

export type PagoConReserva = Pago & {
  reserva: Reserva & {
    cancha: Cancha;
    sede: Sede;
  };
};