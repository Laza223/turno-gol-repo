import type { GridBooking } from './grid-cells'

/**
 * Plan gratis (freemium v2, docs/decisions/2026-11-15-freemium-corte-v2.md):
 * "gratis es quién juega; el plan es quién pagó". Todo turno se ve con su
 * nombre, también lo que se anotó en la prueba y los fijos que ya estaban
 * cargados; la plata no se ve nunca. El precio de una reserva online queda
 * porque es el que vio el jugador; el de lo que anotó el staff, en 0. Sin
 * cobros: la caja es del plan pago, así que no hay saldo.
 *
 * Una sola función para el render de servidor (`reservas/queries.ts`) y para la
 * grilla en vivo (`use-booking-realtime.ts`): si divergen, la grilla mostraría el
 * nombre al primer evento de Realtime.
 */
export function isOnlineBooking(b: { type: string; createdByStaff: string | null }): boolean {
  return b.type === 'spontaneous' && b.createdByStaff === null
}

export function maskGridBookingForFreePlan<T extends GridBooking>(b: T, online: boolean): T {
  return {
    ...b,
    priceSnapshot: online ? b.priceSnapshot : 0,
    paymentMethod: null,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 0,
    writtenOff: 0,
    // Sin caja no hay "Pagado" ni "No se cobra": el saldo en 0 de arriba no es un cobro.
    moneyHidden: true,
  }
}
