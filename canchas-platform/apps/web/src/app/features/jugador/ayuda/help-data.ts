export interface FaqItem {
  id: string;
  category: 'reservas' | 'pagos' | 'sedes' | 'cuenta';
  categoryLabel: string;
  question: string;
  answer: string;
  keywords: string[];
}

export const SUPPORT_CONFIG = {
  // TODO: Reemplazar con el número oficial de atención al cliente de Canchero (+51 987 654 321 es el número de prueba)
  whatsappNumber: '51987654321',
  supportHours: {
    start: 8, // 08:00
    end: 23, // 23:00
    timeZone: 'America/Lima',
  },
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'reservar',
    category: 'reservas',
    categoryLabel: 'Reservas de Canchas',
    question: '¿Cómo reservo una cancha deportiva en Canchero?',
    answer:
      'Para reservar una cancha, ve a la sección "Sedes", selecciona el complejo deportivo de tu preferencia, elige la cancha (Fútbol 5, 7, 11, etc.), fecha y horario disponible. Haz clic en "Continuar al pago" para completar tu reserva en línea mediante pasarela segura o pago parcial según la sede. Tu confirmación y pase digital se generarán al instante en tu Itinerario.',
    keywords: ['reservar', 'cancha', 'horario', 'alquilar', 'partido', 'cómo reservar', 'sedes'],
  },
  {
    id: 'cancelar',
    category: 'reservas',
    categoryLabel: 'Reservas de Canchas',
    question: '¿Cómo puedo cancelar o reprogramar mi partido?',
    answer:
      'Puedes gestionar tu reserva desde "Mis reservas" (Itinerario) en el menú de usuario. Si las políticas de la sede lo permiten, podrás solicitar la cancelación o reprogramación con al menos 4 horas de anticipación. Te recomendamos comunicarte directamente con la administración de la sede para coordinar una nueva fecha.',
    keywords: [
      'cancelar',
      'reprogramar',
      'devolución',
      'anular',
      'cambiar hora',
      'cambio de fecha',
    ],
  },
  {
    id: 'pagos',
    category: 'pagos',
    categoryLabel: 'Pagos y Facturación',
    question: '¿Cuáles son los métodos de pago aceptados?',
    answer:
      'Aceptamos tarjetas de débito y crédito (Visa, Mastercard, American Express), billeteras digitales (Yape, Plin) y transferencias bancarias a través de pasarelas de pago cifradas. En algunas sedes también puedes pagar un adelanto en línea y abonar la diferencia en la recepción del complejo.',
    keywords: ['pagos', 'tarjeta', 'yape', 'plin', 'efectivo', 'adelanto', 'comprobante', 'precio'],
  },
  {
    id: 'lluvia',
    category: 'reservas',
    categoryLabel: 'Reservas de Canchas',
    question: '¿Qué sucede si llueve o se suspende el partido por causas de fuerza mayor?',
    answer:
      'Si las condiciones climáticas o eventualidades técnicas impiden el desarrollo seguro del partido, la sede deportiva reprogramará tu turno sin penalidad o emitirá un saldo a favor para tu próxima reserva. Canchero coordina directamente con las sedes para garantizar que no pierdas tu turno.',
    keywords: ['lluvia', 'clima', 'suspensión', 'cancelado', 'fuerza mayor', 'corte de luz'],
  },
  {
    id: 'contacto-sede',
    category: 'sedes',
    categoryLabel: 'Sedes y Complejos',
    question: '¿Cómo contacto directamente a una sede deportiva?',
    answer:
      'En la ficha de cada sede dentro de Canchero encontrarás su dirección exacta, distrito, mapa interactivo y botones directos para llamar o abrir chat de WhatsApp con el encargado del complejo.',
    keywords: ['contacto', 'teléfono sede', 'dueño', 'dirección', 'cómo llegar', 'ubicación'],
  },
  {
    id: 'pase-digital',
    category: 'reservas',
    categoryLabel: 'Reservas de Canchas',
    question: '¿Qué debo presentar al llegar al complejo deportivo?',
    answer:
      'Solo necesitas mostrar tu Pase Digital con código QR desde la sección "Mis reservas" en tu celular. El administrador o encargado en recepción escaneará tu código para validar tu entrada de inmediato.',
    keywords: ['pase', 'código qr', 'ingreso', 'llegar', 'entrada', 'dni'],
  },
  {
    id: 'compartir-pase',
    category: 'reservas',
    categoryLabel: 'Reservas de Canchas',
    question: '¿Cómo comparto la reserva y el pase con mi equipo?',
    answer:
      'En cada reserva dentro de "Mis reservas" dispones de un botón "Compartir por WhatsApp". Al pulsarlo se redactará un mensaje con todos los datos (sede, cancha, día, hora y enlace) para enviarlo a tu grupo de amigos con un solo clic.',
    keywords: ['compartir', 'amigos', 'equipo', 'invitar', 'whatsapp'],
  },
  {
    id: 'cuenta-datos',
    category: 'cuenta',
    categoryLabel: 'Cuenta y Perfil',
    question: '¿Cómo actualizo mi número de teléfono o datos de contacto?',
    answer:
      'Ingresa a "Mi cuenta" desde tu menú de perfil. En la pestaña "Perfil" puedes actualizar tus nombres y tu número de WhatsApp para asegurarte de recibir recordatorios y avisos sobre tus reservas.',
    keywords: ['perfil', 'cambiar número', 'whatsapp', 'datos', 'cuenta', 'editar'],
  },
];

/**
 * Calcula si el soporte de atención está activo en base a la hora de Lima (America/Lima)
 * y el horario de atención (08:00 a 23:00).
 */
export function getSupportAvailability(): { active: boolean; message: string; submessage: string } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('es-PE', {
      timeZone: SUPPORT_CONFIG.supportHours.timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '12', 10);

    const start = SUPPORT_CONFIG.supportHours.start;
    const end = SUPPORT_CONFIG.supportHours.end;
    const isActive = hour >= start && hour < end;

    if (isActive) {
      return {
        active: true,
        message: 'Atendiendo ahora',
        submessage: 'Horario habitual: Lun-Dom 08:00 a 23:00',
      };
    } else {
      return {
        active: false,
        message: 'Fuera de horario',
        submessage: 'Te responderemos a las 8:00 a. m.',
      };
    }
  } catch {
    return {
      active: true,
      message: 'Atendiendo hoy',
      submessage: 'Horario habitual: Lun-Dom 08:00 a 23:00',
    };
  }
}

/**
 * Construye el enlace de WhatsApp con mensaje prellenado y codificado.
 */
export function buildSupportWhatsAppUrl(bookingCode?: string): string {
  const number = SUPPORT_CONFIG.whatsappNumber;
  const text = bookingCode
    ? `Hola, necesito ayuda con mi reserva #${bookingCode} en Canchero.`
    : `Hola, necesito ayuda con Canchero.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
