/**
 * "Hoy" (Fase 2 del contrato v2 — docs/planning/2026-08-01-decisiones-de-fase-v2.md
 * §3): home solo-admin (decisión D5). Taxonomía de alertas cerrada por escrito
 * en docs/decisions/2026-08-02-taxonomia-alertas-hoy.md — este módulo es su
 * única implementación, no se agregan alertas nuevas sin pasar por ese doc.
 */

import type { BookingStatus, BookingType, DepositStatus } from '@/modules/bookings/booking.types'

export type HoyData = {
  /** Día operativo (YYYY-MM-DD) sobre el que se arma esta respuesta. */
  date: string
  numbers: {
    collectedTodayCents: number
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
  /** Lo que falta jugar hoy, una entrada por cancha online. Vacío para el
   *  worker del resumen diario, que pide AYER: a un día terminado no le queda
   *  nada por delante. */
  upcoming: UpcomingCourt[]
}

/** Una cancha online y los turnos que le quedan por jugar hoy. */
export type UpcomingCourt = {
  courtId: string
  courtName: string
  turns: UpcomingTurn[]
}

export type UpcomingTurn = {
  bookingId: string
  /** "20:00-21:00" */
  timeLabel: string
  /** "ahora" o "en 25 min" cuando arranca dentro de la hora; null si falta mas. */
  relativeLabel: string | null
  contactName: string
  status: BookingStatus
  type: BookingType
  depositStatus: DepositStatus
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
  /**
   * Devoluciones de seña que el complejo debe. Es UN ítem agregado, no una fila
   * por devolución: los otros tres son anomalías "de hoy" que caducan, y una
   * devolución pendiente no caduca — con tres meses sin tildar, N filas
   * convertirían esta sección en la bandeja de notificaciones que la taxonomía
   * de alertas vino a evitar.
   */
  | {
      kind: 'pending_refunds'
      count: number
      totalCents: number
      since: Date
    }
