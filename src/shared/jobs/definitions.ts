/**
 * Centralized pg-boss queue names + send options.
 * Retry config lives on SendOptions (per enqueue), not on WorkOptions (pg-boss v9).
 */

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_SEND_EMAIL = 'send-email'
export const QUEUE_PUSH_SEND = 'push-send'
export const QUEUE_EXPIRE_TRIALS = 'expire-trials'
export const QUEUE_AUTO_COMPLETE = 'auto-complete-bookings'
export const QUEUE_BOOKING_REMINDER = 'booking-reminder'
export const QUEUE_DUNNING_RETRY = 'dunning-retry'
export const QUEUE_DATA_RETENTION = 'data-retention-cleanup'
export const QUEUE_EXPIRE_PENDING_BOOKING = 'expire-pending-booking'
export const QUEUE_EXPIRE_PENDING_BOOKING_SWEEP = 'expire-pending-booking-sweep'
export const QUEUE_REFRESH_MP_TOKENS = 'refresh-mp-tokens'
export const QUEUE_RECONCILE_PENDING_PAYMENTS = 'reconcile-pending-payments'
export const QUEUE_HEALTH_PING = 'health-ping'

// ─── Job payload types ────────────────────────────────────────────────────────

export type SendEmailJobData = {
  notification_id: string
}

export type BookingReminderJobData = {
  booking_id: string
  player_id: string
  reminder_type: '24h'
}

export type ExpirePendingBookingJobData = {
  bookingId: string
}

// ─── Expiry cutoffs (Hallazgo 1 + 2) ──────────────────────────────────────────
// Default: 15 min for a normal deposit. in_process (CBU/transferencia 24-48h):
// 48h before freeing the slot so we don't expire a booking mid-payment.
export const DEFAULT_EXPIRY_SECONDS = 15 * 60
export const IN_PROCESS_EXPIRY_SECONDS = 48 * 60 * 60

// ─── Send options (retry config) ──────────────────────────────────────────────

export const SEND_EMAIL_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInHours: 24,
} as const

export const BOOKING_REMINDER_SEND_OPTIONS = {
  retryLimit: 2,
  retryDelay: 300,
  retryBackoff: true,
} as const

export const EXPIRE_PENDING_BOOKING_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  // Must outlive the 48h in_process cutoff so a rescheduled job isn't dropped.
  expireInHours: 49,
} as const

// ─── Push notifications ───────────────────────────────────────────────────────

export type PushSendJobData = {
  subscription_id: string
  payload: {
    type: string
    bookingId?: string
    courtName?: string
    dateLabel?: string
    timeLabel?: string
    url?: string
    [k: string]: unknown
  }
}

export const PUSH_SEND_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInHours: 1,
} as const
