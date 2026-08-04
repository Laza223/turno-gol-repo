/**
 * "Hoy" (Fase 2 del contrato v2 — docs/planning/2026-08-01-decisiones-de-fase-v2.md
 * §3): home solo-admin (decisión D5). Taxonomía de alertas cerrada por escrito
 * en docs/decisions/2026-08-02-taxonomia-alertas-hoy.md — este módulo es su
 * única implementación, no se agregan alertas nuevas sin pasar por ese doc.
 */

export type HoyData = {
  /** Día operativo (YYYY-MM-DD) sobre el que se arma esta respuesta. */
  date: string
  numbers: {
    collectedTodayCents: number
    collectedSameWeekdayLastWeekCents: number
    occupancy: { occupied: number; available: number; blocked: number; pct: number }
    /** === sumStreetMoney(streetMoneyRows) — misma fuente que /caja y /caja/deudas. */
    streetMoneyCents: number
    /** Caja de `date` cerrada. Reusado por el resumen diario (D8, worker):
     *  cuando `date` = ayer, esto responde "¿cerraste la caja de ayer?" para el
     *  copy del digest, sin que la pantalla en vivo tenga que mostrarlo. */
    cashClosed: boolean
  }
  whileYouWereAway: WhileAwayItem[]
  needsAttention: AttentionItem[]
}

export type WhileAwayItem =
  | {
      kind: 'booking_online'
      bookingId: string
      at: Date
      courtName: string
      timeLabel: string
      contactName: string
    }
  | {
      kind: 'cancellation'
      bookingId: string
      at: Date
      courtName: string
      timeLabel: string
      contactName: string
    }
  | {
      kind: 'deposit_paid'
      bookingId: string
      at: Date
      amountCents: number
      courtName: string
      contactName: string
    }

export type AttentionItem =
  | {
      kind: 'unpaid_completed_booking'
      bookingId: string
      pendingCents: number
      since: Date
      courtName: string
      timeLabel: string
      contactName: string
    }
  | {
      kind: 'failed_deposit'
      paymentId: string
      bookingId: string
      amountCents: number
      since: Date
      courtName: string
      contactName: string
    }
  | {
      kind: 'yesterday_cash_unclosed'
      date: string
      since: Date
    }
