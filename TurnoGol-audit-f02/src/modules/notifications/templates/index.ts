export type EmailContent = { subject: string; html: string; text?: string }

export type { BookingConfirmedData } from './booking-confirmed'
export type { BookingCanceledData } from './booking-canceled'
export type { BookingReminderData } from './booking-reminder'
export type { AdminNewBookingData } from './admin-new-booking'
export type { TrialWelcomeData } from './trial-welcome'
export type { TrialEndingData } from './trial-ending'
export type { DunningPaymentFailedData } from './dunning-payment-failed'
export type { DepositExpiredData } from './deposit-expired'
export type { AdminTransferExpiredData } from './admin-transfer-expired'
export type { AdminLatePaymentData } from './admin-late-payment'
export type { SubscriptionActivatedData } from './subscription-activated'
export type { SubscriptionRenewedData } from './subscription-renewed'
export type { SubscriptionCanceledData } from './subscription-canceled'
export type { SubscriptionSuspendedData } from './subscription-suspended'
export type { SubscriptionBlockedData } from './subscription-blocked'
export type { TenantDeletionWarningData } from './tenant-deletion-warning'

import { renderBookingConfirmed, type BookingConfirmedData } from './booking-confirmed'
import { renderBookingCanceled, type BookingCanceledData } from './booking-canceled'
import { renderBookingReminder, type BookingReminderData } from './booking-reminder'
import { renderAdminNewBooking, type AdminNewBookingData } from './admin-new-booking'
import { renderTrialWelcome, type TrialWelcomeData } from './trial-welcome'
import { renderTrialEnding, type TrialEndingData } from './trial-ending'
import { renderDunningPaymentFailed, type DunningPaymentFailedData } from './dunning-payment-failed'
import { renderDepositExpired, type DepositExpiredData } from './deposit-expired'
import { renderAdminTransferExpired, type AdminTransferExpiredData } from './admin-transfer-expired'
import { renderAdminLatePayment, type AdminLatePaymentData } from './admin-late-payment'
import { renderSubscriptionActivated, type SubscriptionActivatedData } from './subscription-activated'
import { renderSubscriptionRenewed, type SubscriptionRenewedData } from './subscription-renewed'
import { renderSubscriptionCanceled, type SubscriptionCanceledData } from './subscription-canceled'
import { renderSubscriptionSuspended, type SubscriptionSuspendedData } from './subscription-suspended'
import { renderSubscriptionBlocked, type SubscriptionBlockedData } from './subscription-blocked'
import { renderTenantDeletionWarning, type TenantDeletionWarningData } from './tenant-deletion-warning'

export {
  renderBookingConfirmed,
  renderBookingCanceled,
  renderBookingReminder,
  renderAdminNewBooking,
  renderTrialWelcome,
  renderTrialEnding,
  renderDunningPaymentFailed,
  renderDepositExpired,
  renderAdminTransferExpired,
  renderAdminLatePayment,
  renderSubscriptionActivated,
  renderSubscriptionRenewed,
  renderSubscriptionCanceled,
  renderSubscriptionSuspended,
  renderSubscriptionBlocked,
  renderTenantDeletionWarning,
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
  admin_transfer_expired: AdminTransferExpiredData
  admin_late_payment: AdminLatePaymentData
  subscription_activated: SubscriptionActivatedData
  subscription_renewed: SubscriptionRenewedData
  subscription_canceled: SubscriptionCanceledData
  subscription_suspended: SubscriptionSuspendedData
  subscription_blocked: SubscriptionBlockedData
  tenant_deletion_warning: TenantDeletionWarningData
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
  admin_transfer_expired: renderAdminTransferExpired,
  admin_late_payment: renderAdminLatePayment,
  subscription_activated: renderSubscriptionActivated,
  subscription_renewed: renderSubscriptionRenewed,
  subscription_canceled: renderSubscriptionCanceled,
  subscription_suspended: renderSubscriptionSuspended,
  subscription_blocked: renderSubscriptionBlocked,
  tenant_deletion_warning: renderTenantDeletionWarning,
}

export function renderTemplate(name: TemplateName, data: unknown): EmailContent {
  const renderer = RENDERERS[name] as (d: unknown) => EmailContent
  return renderer(data)
}

export function isTemplateName(name: string): name is TemplateName {
  return name in RENDERERS
}
