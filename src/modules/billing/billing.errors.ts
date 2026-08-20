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
 * 01-billing-upgrade-dedup: `upgrade()` creaba una preferencia MP nueva y
 * pisaba `pending_plan_change` sin chequear si ya había OTRO cambio
 * pendiente (upgrade sin pagar, o downgrade agendado). Si el pago de la
 * preferencia VIEJA se acreditaba después de que una llamada posterior ya
 * hubiera sobreescrito `pending_plan_change`, el CAS de `handleUpgradeApproved`
 * no matcheaba y ese pago quedaba huérfano en silencio. Mensaje en español:
 * llega directo al dueño vía `ChangePlanSection` (mismo patrón que
 * `InvalidPayerEmailError`).
 */
export class UpgradeAlreadyPendingError extends Error {
  readonly code = 'UPGRADE_ALREADY_PENDING'
  constructor(
    public readonly tenantId: string,
    public readonly pendingPlanId: string,
  ) {
    super(
      'Ya tenés un cambio de plan pendiente. Completá o esperá a que venza ese pago antes de pedir otro cambio.',
    )
    this.name = 'UpgradeAlreadyPendingError'
  }
}

/**
 * ENS-23: MP rechaza el preapproval si el `payer_email` no tiene cuenta de
 * MercadoPago asociada ("Both payer and collector must be real or test
 * users"). Mensaje en español porque llega directo al dueño vía
 * `ActivatePlanSection` (`err.message` se muestra tal cual, mismo patrón que
 * `AbonadoConflictError`).
 *
 * El mensaje viejo ofrecía dos salidas: crear una cuenta de MP con ese email, o
 * cambiar el email de la cuenta de TurnoGol. La segunda puede estar CERRADA
 * (caso real en prod, 2026-08-19: el email de su cuenta de MP ya estaba tomado
 * en `auth.users` por su propia cuenta de jugadora) — le pedía justo lo que la
 * app le impedía hacer. Desde la migr. 078 la salida real es declarar el email
 * de MercadoPago sin tocar el de login, así que el mensaje apunta ahí y NOMBRA
 * el email rechazado: sin eso el dueño no sabe cuál de los dos falló.
 */
export class InvalidPayerEmailError extends Error {
  readonly code = 'INVALID_PAYER_EMAIL'
  constructor(
    public readonly tenantId: string,
    public readonly payerEmail: string,
  ) {
    super(
      `MercadoPago no encontró una cuenta con el email ${payerEmail}. Escribí abajo, en "Cuenta de MercadoPago para pagar", el email con el que entrás a MercadoPago — puede ser distinto al que usás para entrar a TurnoGol.`,
    )
    this.name = 'InvalidPayerEmailError'
  }
}
