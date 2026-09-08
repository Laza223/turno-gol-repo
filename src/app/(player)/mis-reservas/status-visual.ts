import type { StatusBadgeVisual } from '@/components/ui/status-badge'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import type { StatusTone } from '@/lib/status-tone'

/**
 * Adaptador de superficie del portal del jugador, mismo patrón que los cinco
 * del admin (`reservas`, `abonados`, `canchas`, `equipo`, `super-admin`).
 *
 * Antes esta vista tenía TRES tablas paralelas —label, ícono y clases— para
 * los mismos `booking_status` que ya describe `slot-visual.ts`, y habían
 * divergido:
 *
 * - Género: decía "Confirmado" y "Expirado" donde el complejo lee "Confirmada"
 *   y "Expirada". MASTER §8 pide que las dos superficies digan lo mismo,
 *   porque jugador y encargado hablan del mismo turno por teléfono.
 * - Contraste: "Jugada", las dos cancelaciones y "Expirada" usaban
 *   `bg-muted text-muted-foreground` (4.21:1, falla AA — `status-tone.ts:5-10`).
 * - Copy: el estado de "arrancó a pagar y no terminó" tenía tres nombres en el
 *   producto. Queda uno, el de `slot-visual.ts`: "Esperando seña" (MASTER §8.5,
 *   decisión del dueño 2026-09-10).
 *
 * Ahora el label y el ícono salen de la tabla compartida y no pueden volver a
 * separarse; hay un test que lo fija.
 */

/**
 * Las dos cosas que el jugador SÍ ve distinto que el complejo, a propósito.
 *
 * `confirmed` en verde y no en el azul del admin: la grilla usa el azul para
 * separar "pagada entera" de "señada", que es una distinción de caja. El
 * jugador no tiene esa distinción — para él confirmada es "listo, jugás" — y
 * el verde es lo que significa "listo" en todo el portal.
 */
const TONO_DEL_JUGADOR: Partial<Record<string, StatusTone>> = {
  confirmed: 'success',
}

/**
 * El complejo lee las dos cancelaciones como una sola ("Cancelada"): para su
 * caja el turno se liberó y punto. Para el jugador la diferencia es su plata,
 * así que acá se dice cuál de las dos fue.
 */
const LABEL_DEL_JUGADOR: Partial<Record<string, string>> = {
  canceled_no_refund: 'Cancelada (sin reembolso)',
}

export function playerBookingVisual(status: string): StatusBadgeVisual {
  const base = bookingBadgeVisual({
    status,
    // Tipo neutralizado a propósito: en la grilla `fixed` PISA al estado porque
    // una celda muestra una cosa sola, pero acá el turno fijo ya tiene su
    // propio chip al lado. Sin esto la tarjeta diría "Abonado" y "Turno fijo".
    type: 'spontaneous',
    // Sin datos de plata: la alarma "Sin cobrar" es de la caja del complejo, no
    // del jugador. Que él vea que el complejo no cobró no le sirve de nada y
    // expone un dato interno del mostrador.
    pending: null,
    totalPaid: null,
  })
  return {
    icon: base.icon,
    label: LABEL_DEL_JUGADOR[status] ?? base.label,
    tone: TONO_DEL_JUGADOR[status] ?? base.tone,
  }
}
