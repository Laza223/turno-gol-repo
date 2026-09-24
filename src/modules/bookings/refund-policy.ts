/**
 * Extraído de `booking.cancellation.ts` (mismo archivo, cero cambios de
 * comportamiento) para que `getRefundOutcome` (`refund-outcome.ts`) lo pueda
 * reusar desde un componente cliente (el aviso de seña necesita recalcularse
 * en vivo con el reloj del navegador — R3-1/ENS-2) sin arrastrar al bundle del
 * browser el resto de `booking.cancellation.ts` (drizzle-orm, `@/shared/db`,
 * `payment.service`, `notification.service`, `@/shared/db/audit` →
 * `impersonation-cookie` → `node:crypto`). `booking.cancellation.ts` sigue
 * reexportando desde acá, así que `cancellation-preview.ts` y
 * `reservas/actions.ts` no cambian su import.
 */
export type AdminCancellationType = 'complejo' | 'jugador'

/**
 * Tarea #3: el motivo decide el reembolso, el admin ya no elige a ciegas.
 * - 'complejo' (rotura / mantenimiento / error del admin): reembolso SIEMPRE,
 *   sin importar el plazo — no es culpa del jugador.
 * - 'jugador' (pidió por teléfono): aplica la política normal — dentro del
 *   plazo reembolsa, fuera retiene.
 * `inPolicy` se devuelve para el rastro de auditoría (también en el caso
 * 'complejo', donde no afecta la decisión pero documenta el contexto).
 *
 * Bug B3 (guard de turno YA TERMINADO): si `nowMs >= bookingEndUtcMs` el
 * servicio ya se prestó — el admin puede cancelar sin reembolso, pero NUNCA
 * reembolsar, ni siquiera con cancellationType='complejo'. Este guard corta
 * el camino antes de mirar el motivo.
 */
export function decideAdminRefund(opts: {
  cancellationType: AdminCancellationType
  bookingStartUtcMs: number
  bookingEndUtcMs: number
  policyHours: number
  nowMs: number
}): { shouldRefund: boolean; inPolicy: boolean } {
  const inPolicy = opts.nowMs < opts.bookingStartUtcMs - opts.policyHours * 3_600_000
  const turnoTermino = opts.nowMs >= opts.bookingEndUtcMs
  const shouldRefund = turnoTermino ? false : opts.cancellationType === 'complejo' ? true : inPolicy
  return { shouldRefund, inPolicy }
}
