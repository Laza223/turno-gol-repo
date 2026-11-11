import type { GridBooking } from './grid-cells'

/**
 * Plan gratis (freemium, decisión 4): lo que anotó el staff y los fijos se ven
 * como "Ocupado", sin nombre ni precio; las reservas online, con el nombre del
 * jugador. Sin cobros: la caja es del plan pago, así que no hay saldo.
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
    // Un bloqueo conserva su motivo (Mantenimiento, Cancha cerrada): no nombra a nadie.
    guestName: online ? b.guestName : b.type === 'block' ? b.guestName : 'Ocupado',
    playerFirstName: online ? b.playerFirstName : null,
    playerLastName: online ? b.playerLastName : null,
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
