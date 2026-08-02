/**
 * Movido a `src/modules/bookings/booking.debts.ts` (Fase 1, street-money.service.ts
 * también lo necesita, y un módulo no puede importar de `app/**`). Reexportado
 * acá para no romper este caller.
 */
export { getDebts, type DebtRow } from '@/modules/bookings/booking.debts'
