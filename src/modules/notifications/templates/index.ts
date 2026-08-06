export type EmailContent = { subject: string; html: string; text?: string }

import { renderBookingConfirmed, type BookingConfirmedData } from './booking-confirmed'
import { renderBookingCanceled, type BookingCanceledData } from './booking-canceled'
import { renderBookingCanceledByComplex, type BookingCanceledByComplexData } from './booking-canceled-by-complex'
import { renderBookingRescheduled, type BookingRescheduledData } from './booking-rescheduled'
import { renderAdminNewBooking, type AdminNewBookingData } from './admin-new-booking'
import { renderTrialWelcome, type TrialWelcomeData } from './trial-welcome'
import { renderTrialEnding, type TrialEndingData } from './trial-ending'
import { renderDunningPaymentFailed, type DunningPaymentFailedData } from './dunning-payment-failed'
import { renderDepositExpired, type DepositExpiredData } from './deposit-expired'
import { renderAdminTransferExpired, type AdminTransferExpiredData } from './admin-transfer-expired'
import { renderAdminLatePayment, type AdminLatePaymentData } from './admin-late-payment'
import { renderAdminDepositAfterClose, type AdminDepositAfterCloseData } from './admin-deposit-after-close'
import { renderAdminRefundFailed, type AdminRefundFailedData } from './admin-refund-failed'
import {
  renderAdminExternalRefundDetected,
  type AdminExternalRefundDetectedData,
} from './admin-external-refund-detected'
import { renderSubscriptionActivated, type SubscriptionActivatedData } from './subscription-activated'
import { renderSubscriptionRenewed, type SubscriptionRenewedData } from './subscription-renewed'
import { renderSubscriptionCanceled, type SubscriptionCanceledData } from './subscription-canceled'
import { renderSubscriptionSuspended, type SubscriptionSuspendedData } from './subscription-suspended'
import { renderSubscriptionBlocked, type SubscriptionBlockedData } from './subscription-blocked'
import { renderTenantDeletionWarning, type TenantDeletionWarningData } from './tenant-deletion-warning'
import { renderDailySummary, type DailySummaryData } from './daily-summary'

export {
  renderBookingConfirmed,
  renderBookingCanceled,
  renderBookingCanceledByComplex,
  renderBookingRescheduled,
  renderAdminNewBooking,
  renderTrialWelcome,
  renderTrialEnding,
  renderDunningPaymentFailed,
  renderDepositExpired,
  renderAdminTransferExpired,
  renderAdminLatePayment,
  renderAdminDepositAfterClose,
  renderAdminRefundFailed,
  renderAdminExternalRefundDetected,
}

type TemplateDataMap = {
  booking_confirmed: BookingConfirmedData
  booking_canceled: BookingCanceledData
  booking_canceled_by_complex: BookingCanceledByComplexData
  booking_rescheduled: BookingRescheduledData
  admin_new_booking: AdminNewBookingData
  trial_welcome: TrialWelcomeData
  trial_ending: TrialEndingData
  dunning_payment_failed: DunningPaymentFailedData
  deposit_expired: DepositExpiredData
  admin_transfer_expired: AdminTransferExpiredData
  admin_late_payment: AdminLatePaymentData
  admin_deposit_after_close: AdminDepositAfterCloseData
  admin_refund_failed: AdminRefundFailedData
  admin_external_refund_detected: AdminExternalRefundDetectedData
  subscription_activated: SubscriptionActivatedData
  subscription_renewed: SubscriptionRenewedData
  subscription_canceled: SubscriptionCanceledData
  subscription_suspended: SubscriptionSuspendedData
  subscription_blocked: SubscriptionBlockedData
  tenant_deletion_warning: TenantDeletionWarningData
  daily_summary: DailySummaryData
}

export type TemplateName = keyof TemplateDataMap

const RENDERERS: { [K in TemplateName]: (data: TemplateDataMap[K]) => EmailContent } = {
  booking_confirmed: renderBookingConfirmed,
  booking_canceled: renderBookingCanceled,
  booking_canceled_by_complex: renderBookingCanceledByComplex,
  booking_rescheduled: renderBookingRescheduled,
  admin_new_booking: renderAdminNewBooking,
  trial_welcome: renderTrialWelcome,
  trial_ending: renderTrialEnding,
  dunning_payment_failed: renderDunningPaymentFailed,
  deposit_expired: renderDepositExpired,
  admin_transfer_expired: renderAdminTransferExpired,
  admin_late_payment: renderAdminLatePayment,
  admin_deposit_after_close: renderAdminDepositAfterClose,
  admin_refund_failed: renderAdminRefundFailed,
  admin_external_refund_detected: renderAdminExternalRefundDetected,
  subscription_activated: renderSubscriptionActivated,
  subscription_renewed: renderSubscriptionRenewed,
  subscription_canceled: renderSubscriptionCanceled,
  subscription_suspended: renderSubscriptionSuspended,
  subscription_blocked: renderSubscriptionBlocked,
  tenant_deletion_warning: renderTenantDeletionWarning,
  daily_summary: renderDailySummary,
}

export function renderTemplate(name: TemplateName, data: unknown): EmailContent {
  const renderer = RENDERERS[name] as (d: unknown) => EmailContent
  return renderer(data)
}

export function isTemplateName(name: string): name is TemplateName {
  return name in RENDERERS
}
