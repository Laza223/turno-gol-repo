import type { AttentionItem, WhileAwayItem } from './home.types'

export const ATTENTION_EMPTY_COPY =
  'Nada pendiente. Sin señas rechazadas ni devoluciones por resolver.'

/**
 * Prioridad P1→P2 de la taxonomía (docs/decisions/2026-08-02-taxonomia-alertas-hoy.md).
 * El turno terminado sin cobrar (que era P1) dejó de ser una alerta el 2026-09-19:
 * vive en el tablero "Turnos de hoy", que es donde se cobra.
 */
const ATTENTION_PRIORITY: Record<AttentionItem['kind'], number> = {
  // P1: plata comprometida con un jugador que espera. El daño crece con los días.
  pending_refunds: 1,
  failed_deposit: 2,
}

/** Prioridad P1→P2, luego antigüedad ascendente (la más vieja primero). */
export function sortAttentionItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const byPriority = ATTENTION_PRIORITY[a.kind] - ATTENTION_PRIORITY[b.kind]
    if (byPriority !== 0) return byPriority
    return a.since.getTime() - b.since.getTime()
  })
}

/** Más reciente primero — es un feed de "qué pasó", no una cola a resolver. */
export function sortWhileAwayItems(items: WhileAwayItem[]): WhileAwayItem[] {
  return [...items].sort((a, b) => b.at.getTime() - a.at.getTime())
}
