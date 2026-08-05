/**
 * Deposit (seña) calculation for online bookings.
 *
 * La cuenta MISMA vive en `@/lib/booking/pricing` desde Fase 3 T6: el popover de
 * alta rápida sugiere la seña en el CLIENTE, y un componente de `@/components`
 * no puede importar el dominio como valor (regla de lint). Este módulo la
 * re-exporta para los callers de servidor (`booking.service`) — una sola
 * implementación, así el monto sugerido en pantalla nunca puede diferir del que
 * el server termina grabando.
 *
 * Sigue siendo pura y sin dependencias de DB, así que el redondeo se testea sin
 * levantar Postgres (`tests/unit/money-math-precision.test.ts`).
 */
export { calcDepositCents } from '@/lib/booking/pricing'
