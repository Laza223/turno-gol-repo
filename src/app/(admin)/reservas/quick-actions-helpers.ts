/**
 * Helper puro compartido entre el Server Component (BookingListItem decide
 * padding/render) y el Client Component (QuickActions decide su propio
 * early-return). Vive en módulo propio sin 'use client': importarlo desde un
 * archivo client convertiría la función en client reference y el server no
 * podría ejecutarla (error en runtime RSC, invisible en vitest).
 */
export function hasQuickActions(booking: { status: string; type: string }): boolean {
  if (booking.type === 'block') return false
  return booking.status === 'pending_payment' || booking.status === 'confirmed'
}
