import { normalizeForSearch } from '@/lib/search'
import type { StaffRole } from '@/modules/staff/roles'
import { SUPPORT_EMAIL } from '@/shared/constants'

const SECTION_LABELS = {
  '/dashboard': 'Hoy',
  '/grilla': 'Grilla',
  '/reservas': 'Agenda',
  '/jugadores': 'Clientes y Fijos',
  '/abonados': 'Turnos fijos',
  '/caja': 'Caja',
  '/canchas': 'Canchas',
  '/settings/horarios': 'Horarios',
  '/settings/reservas': 'Reservas por internet',
  '/settings': 'Ajustes',
  '/notificaciones': 'Notificaciones',
  '/analiticas': 'Métricas',
  '/torneos': 'Torneos',
}

type HelpSection = keyof typeof SECTION_LABELS

interface HelpGuide {
  id: string
  title: string
  answer: string
  href: string
  linkLabel: string
  aliases: string[]
  suggestedOn: HelpSection[]
  adminOnly?: boolean
  paidOnly?: boolean
  availableInReadOnly?: boolean
}

const GUIDES: HelpGuide[] = [
  {
    id: 'list-fixed-bookings',
    paidOnly: true,
    title: '¿Dónde están los turnos fijos?',
    answer:
      'Entrá a Clientes y Fijos → Turnos fijos para ver las reservas que se repiten todas las semanas.',
    href: '/abonados',
    linkLabel: 'Abrir Turnos fijos',
    aliases: ['fijo', 'abonado', 'turno semanal', 'ver fijos'],
    suggestedOn: ['/jugadores', '/abonados'],
    availableInReadOnly: true,
  },
  {
    id: 'create-fixed-booking',
    paidOnly: true,
    title: '¿Cómo creo un turno fijo?',
    answer:
      'Abrí Nuevo turno fijo y completá el cliente, la cancha y el horario. Tocá Continuar para revisar la disponibilidad y confirmá. Si ya estás en Grilla, tocá un horario libre y elegí Turno fijo.',
    href: '/abonados/nuevo',
    linkLabel: 'Abrir Nuevo turno fijo',
    aliases: ['crear turnos fijos', 'cargar un fijo', 'agregar abonado', 'turno semanal'],
    suggestedOn: ['/grilla', '/jugadores', '/abonados'],
  },
  {
    id: 'cancel-fixed-occurrence',
    paidOnly: true,
    title: '¿Cómo cancelo una sola fecha de un turno fijo?',
    answer:
      'Buscá esa fecha en Grilla, abrí el turno y elegí Cancelar reserva. El fijo sigue activo las demás semanas.',
    href: '/grilla',
    linkLabel: 'Abrir Grilla',
    aliases: ['cancelar un fijo por un día', 'saltar una semana', 'cancelar una reserva fija'],
    suggestedOn: ['/abonados', '/reservas', '/grilla'],
  },
  {
    id: 'create-booking',
    title: '¿Cómo cargo un turno suelto?',
    answer: 'En Grilla, tocá un horario libre de la cancha, elegí Turno y completá la reserva.',
    href: '/grilla',
    linkLabel: 'Abrir Grilla',
    aliases: ['crear turno', 'agendar reserva', 'reserva manual', 'cargar un turno'],
    suggestedOn: ['/grilla', '/reservas'],
  },
  {
    id: 'block-court',
    title: '¿Cómo bloqueo una cancha por un rato?',
    answer:
      'En Grilla, tocá el primer horario libre que querés bloquear. Elegí Bloquear cancha e indicá hasta qué hora.',
    href: '/grilla',
    linkLabel: 'Abrir Grilla',
    aliases: ['bloquear horario', 'bloquear cancha', 'mantenimiento', 'cerrar cancha'],
    suggestedOn: ['/grilla', '/reservas'],
  },
  {
    id: 'charge-booking',
    paidOnly: true,
    title: '¿Cómo cobro un turno?',
    answer: 'En Hoy, buscá el turno en Cobrar ahora. Abrilo y registrá el pago.',
    href: '/dashboard',
    linkLabel: 'Abrir Hoy',
    aliases: ['cobrar turno', 'cobrar cancha', 'registrar un pago', 'cobro', 'cobrar por equipo'],
    suggestedOn: ['/dashboard'],
  },
  {
    id: 'sell-canteen',
    paidOnly: true,
    title: '¿Cómo cargo una venta de cantina?',
    answer: 'Tocá Vender, agregá los productos y registrá cómo te pagaron.',
    href: '/dashboard',
    linkLabel: 'Ir a Hoy para vender',
    aliases: ['vender', 'venta de productos', 'kiosco', 'buffet', 'vender bebida'],
    suggestedOn: ['/dashboard', '/caja'],
  },
  {
    id: 'list-pending-charges',
    paidOnly: true,
    title: '¿Dónde veo lo que quedó por cobrar?',
    answer: 'Entrá a Caja → Cuentas para ver los turnos y consumos que quedaron pendientes.',
    href: '/caja/cuentas',
    linkLabel: 'Abrir Cuentas',
    aliases: ['por cobrar', 'sin cobrar', 'saldo pendiente', 'deudas', 'cuentas pendientes'],
    suggestedOn: ['/caja', '/dashboard'],
    availableInReadOnly: true,
  },
  {
    id: 'change-opening-hours',
    title: '¿Cómo cambio los horarios de apertura?',
    answer: 'Entrá a Ajustes → Horarios. Elegí el día, cambiá las horas y guardá.',
    href: '/settings/horarios',
    linkLabel: 'Abrir Horarios',
    aliases: ['horario del complejo', 'hora de cierre', 'hora de apertura', 'días cerrados'],
    suggestedOn: ['/settings', '/settings/horarios'],
    adminOnly: true,
  },
  {
    id: 'change-court-prices',
    title: '¿Cómo cambio el precio de una cancha?',
    answer: 'Entrá a Canchas, tocá Editar en la cancha y ajustá los precios por día y hora.',
    href: '/canchas',
    linkLabel: 'Abrir Canchas',
    aliases: ['editar precios', 'tarifas', 'cuánto sale la cancha', 'precio por hora'],
    suggestedOn: ['/canchas', '/settings'],
    adminOnly: true,
  },
  {
    id: 'enable-online-booking',
    title: '¿Cómo habilito las reservas por internet?',
    answer:
      'En Ajustes → Reservas por internet, activá Reservar desde tu página y tocá Guardar cambios.',
    href: '/settings/reservas',
    linkLabel: 'Abrir Reservas por internet',
    aliases: [
      'reservas online',
      'abrir reservas',
      'habilitar reservas',
      'reservas desde mi página',
    ],
    suggestedOn: ['/settings', '/settings/reservas'],
    adminOnly: true,
  },
  {
    id: 'configure-deposit',
    paidOnly: true,
    title: '¿Cómo configuro la seña de las reservas online?',
    answer:
      'Entrá a Ajustes → Seña. Si todavía te falta, conectá MercadoPago. Elegí Cobrar seña, indicá el porcentaje y tocá Guardar cambios.',
    href: '/settings/reservas#sena',
    linkLabel: 'Abrir configuración de seña',
    aliases: ['cambiar seña', 'porcentaje de seña', 'anticipo', 'cobrar seña online'],
    suggestedOn: ['/settings', '/settings/reservas'],
    adminOnly: true,
  },
]

const QUESTION_WORDS = new Set([
  'a',
  'al',
  'como',
  'de',
  'del',
  'donde',
  'el',
  'en',
  'es',
  'estan',
  'hago',
  'la',
  'las',
  'lo',
  'los',
  'para',
  'que',
  'se',
  'un',
  'una',
])

function getSection(pathname: string) {
  return (Object.keys(SECTION_LABELS) as HelpSection[]).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function searchTerms(value: string) {
  return normalizeForSearch(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term && !QUESTION_WORDS.has(term))
}

export function getHelpGuides({
  pathname,
  staffRole,
  readOnly,
  freePlan,
  query,
}: {
  pathname: string
  staffRole?: StaffRole
  readOnly?: boolean
  freePlan?: boolean
  query: string
}): HelpGuide[] {
  const guides = GUIDES.filter(
    (guide) =>
      (!guide.adminOnly || staffRole === 'admin') &&
      (!guide.paidOnly || !freePlan) &&
      (!readOnly || guide.availableInReadOnly),
  )
  const terms = searchTerms(query)

  if (terms.length > 0) {
    return guides.filter((guide) =>
      [guide.title, ...guide.aliases].some((phrase) => {
        const words = searchTerms(phrase)
        return terms.every((term) => words.some((word) => word.startsWith(term)))
      }),
    )
  }

  const section = getSection(pathname)
  if (!section) return guides

  const suggested = (guide: HelpGuide) => Number(guide.suggestedOn.includes(section))
  return guides.sort((a, b) => suggested(b) - suggested(a))
}

export function getHelpReportHref(pathname: string): string {
  const section = getSection(pathname)
  const subject = encodeURIComponent('Problema en el panel de TurnoGol')
  const body = encodeURIComponent(
    `Sección: ${section ? SECTION_LABELS[section] : 'Panel'}\r\n\r\n¿Qué estabas haciendo y qué pasó?\r\n`,
  )
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}
