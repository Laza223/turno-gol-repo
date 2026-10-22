import { LATE_CANCEL_BAN_DAYS } from '@/shared/constants'

/**
 * Cancelación tardía (complejos sin seña). Funciones puras, sin DB: las usan
 * también los diálogos del cliente (vía `getCancellationPreview`). Decisión:
 * docs/decisions/2026-10-21-cancelacion-tardia.md. `applyLateCancelStrike`, que
 * escribe, vive en `relationships/ptr.service.ts` junto al softban que reusa.
 */

/** Motivo del softban en `tenant_player_bans`; las ausencias tienen el suyo. */
export const LATE_CANCEL_SOFTBAN_REASON = 'Cancelaciones tardías reiteradas'

export type LateCancelPenalty = { kind: 'warning' } | { kind: 'ban'; days: number }

/** `hours` = `settings.late_cancel_hours`; 0 (o ausente) apaga la penalidad. */
export function isLateCancel(opts: { startsAtMs: number; nowMs: number; hours: number }): boolean {
  return opts.hours > 0 && opts.nowMs >= opts.startsAtMs - opts.hours * 3_600_000
}

/**
 * Consecuencia de la cancelación tardía número `count` dentro de la ventana
 * (cuenta la actual): 1ra aviso, 2da 7 días, 3ra o más 30 días (el tope).
 */
export function lateCancelPenalty(count: number): LateCancelPenalty {
  if (count <= 1) return { kind: 'warning' }
  return { kind: 'ban', days: count === 2 ? LATE_CANCEL_BAN_DAYS[0] : LATE_CANCEL_BAN_DAYS[1] }
}

/**
 * Lo que le pasa al jugador si cancela AHORA, para el diálogo de Mis reservas.
 * `hours` es `late_cancel_hours` del complejo.
 */
export function lateCancelPlayerText(
  penalty: LateCancelPenalty,
  hours: number,
  tenantName: string,
): string {
  const lead = `Faltan menos de ${hours} h.`
  if (penalty.kind === 'ban') {
    return `${lead} Si cancelás, no vas a poder reservar online en ${tenantName} por ${penalty.days} días.`
  }
  return `${lead} Esta vez es solo un aviso: si volvés a cancelar tarde en ${tenantName}, no vas a poder reservar online por ${LATE_CANCEL_BAN_DAYS[0]} días.`
}
