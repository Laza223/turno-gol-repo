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
