/**
 * Billing module errors. All extend Error so framework-agnostic; route layer
 * maps to HTTP status codes.
 */

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION'
  constructor(
    public readonly tenantId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Tenant ${tenantId} cannot transition from '${from}' to '${to}'`)
    this.name = 'InvalidTransitionError'
  }
}

export class DowngradeBlockedError extends Error {
  readonly code = 'DOWNGRADE_BLOCKED'
  constructor(
    public readonly tenantId: string,
    public readonly currentCourtCount: number,
    public readonly targetMaxCourts: number,
  ) {
    super(
      `Tenant ${tenantId} has ${currentCourtCount} courts; target plan caps at ${targetMaxCourts}`,
    )
    this.name = 'DowngradeBlockedError'
  }
}

export class ReactivateNotAllowedError extends Error {
  readonly code = 'REACTIVATE_NOT_ALLOWED'
  constructor(
    public readonly tenantId: string,
    public readonly currentStatus: string,
  ) {
    super(`Tenant ${tenantId} in status '${currentStatus}' cannot be reactivated`)
    this.name = 'ReactivateNotAllowedError'
  }
}

export class SubscriptionNotFoundError extends Error {
  readonly code = 'SUBSCRIPTION_NOT_FOUND'
  constructor(public readonly tenantId: string) {
    super(`No subscription found for tenant ${tenantId}`)
    this.name = 'SubscriptionNotFoundError'
  }
}

export class PlanNotFoundError extends Error {
  readonly code = 'PLAN_NOT_FOUND'
  constructor(public readonly planId: string) {
    super(`Plan ${planId} not found or inactive`)
    this.name = 'PlanNotFoundError'
  }
}

/**
 * ENS-23: MP rechaza el preapproval si `payer_email` (el email del dueño del
 * tenant) no tiene cuenta de MercadoPago asociada ("Both payer and collector
 * must be real or test users"). Mensaje en español porque llega directo al
 * dueño vía `ActivatePlanSection` (`err.message` se muestra tal cual, mismo
 * patrón que `AbonadoConflictError`).
 */
export class InvalidPayerEmailError extends Error {
  readonly code = 'INVALID_PAYER_EMAIL'
  constructor(
    public readonly tenantId: string,
    public readonly payerEmail: string,
  ) {
    super(
      'El email de tu cuenta no tiene una cuenta de MercadoPago asociada. Creá una cuenta de MercadoPago con ese email o actualizá tu email.',
    )
    this.name = 'InvalidPayerEmailError'
  }
}
