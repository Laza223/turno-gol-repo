export type EmailContent = { subject: string; html: string; text?: string }

export type { BookingConfirmedData } from './booking-confirmed'
export type { BookingCanceledData } from './booking-canceled'
export type { BookingReminderData } from './booking-reminder'
export type { AdminNewBookingData } from './admin-new-booking'
export type { TrialWelcomeData } from './trial-welcome'
export type { TrialEndingData } from './trial-ending'
export type { DunningPaymentFailedData } from './dunning-payment-failed'
export type { DepositExpiredData } from './deposit-expired'

import { renderBookingConfirmed, type BookingConfirmedData } from './booking-confirmed'
import { renderBookingCanceled, type BookingCanceledData } from './booking-canceled'
import { renderBookingReminder, type BookingReminderData } from './booking-reminder'
import { renderAdminNewBooking, type AdminNewBookingData } from './admin-new-booking'
import { renderTrialWelcome, type TrialWelcomeData } from './trial-welcome'
import { renderTrialEnding, type TrialEndingData } from './trial-ending'
import { renderDunningPaymentFailed, type DunningPaymentFailedData } from './dunning-payment-failed'
import { renderDepositExpired, type DepositExpiredData } from './deposit-expired'

export {
  renderBookingConfirmed,
  renderBookingCanceled,
  renderBookingReminder,
  renderAdminNewBooking,
  renderTrialWelcome,
  renderTrialEnding,
  renderDunningPaymentFailed,
  renderDepositExpired,
}

type TemplateDataMap = {
  booking_confirmed: BookingConfirmedData
  booking_canceled: BookingCanceledData
  booking_reminder: BookingReminderData
  admin_new_booking: AdminNewBookingData
  trial_welcome: TrialWelcomeData
  trial_ending: TrialEndingData
  dunning_payment_failed: DunningPaymentFailedData
  deposit_expired: DepositExpiredData
}

export type TemplateName = keyof TemplateDataMap

const RENDERERS: { [K in TemplateName]: (data: TemplateDataMap[K]) => EmailContent } = {
  booking_confirmed: renderBookingConfirmed,
  booking_canceled: renderBookingCanceled,
  booking_reminder: renderBookingReminder,
  admin_new_booking: renderAdminNewBooking,
  trial_welcome: renderTrialWelcome,
  trial_ending: renderTrialEnding,
  dunning_payment_failed: renderDunningPaymentFailed,
  deposit_expired: renderDepositExpired,
}

export function renderTemplate(name: TemplateName, data: unknown): EmailContent {
  const renderer = RENDERERS[name] as (d: unknown) => EmailContent
  return renderer(data)
}

export function isTemplateName(name: string): name is TemplateName {
  return name in RENDERERS
}
