import type { AttentionItem, WhileAwayItem } from './home.types'

export const ATTENTION_EMPTY_COPY = 'Nada pendiente. Todo cobrado y cerrado.'

/** Prioridad P1→P3 de la taxonomía (docs/decisions/2026-08-02-taxonomia-alertas-hoy.md). */
const ATTENTION_PRIORITY: Record<AttentionItem['kind'], number> = {
  unpaid_completed_booking: 1,
  failed_deposit: 2,
  yesterday_cash_unclosed: 3,
}

export function compareToLastWeek(
  todayCents: number,
  sameWeekdayLastWeekCents: number,
): { deltaCents: number; deltaPct: number | null; direction: 'up' | 'down' | 'flat' } {
  const deltaCents = todayCents - sameWeekdayLastWeekCents
  const direction = deltaCents > 0 ? 'up' : deltaCents < 0 ? 'down' : 'flat'
  const deltaPct =
    sameWeekdayLastWeekCents === 0 ? null : (deltaCents / sameWeekdayLastWeekCents) * 100
  return { deltaCents, deltaPct, direction }
}

/** Prioridad P1→P3, luego antigüedad ascendente (mismo criterio que getStreetMoney.sort). */
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
