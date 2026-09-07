import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { isNonProductionRuntime } from '@/shared/runtime-env'
import type { PaymentGateway } from './mp-gateway'
import type {
  CreatePreapprovalInput,
  CreatePreferenceInput,
  CreateSaasUpgradePreferenceInput,
  GatewayPaymentInfo,
  GatewaySubscriptionState,
  PreapprovalResult,
  PreferenceResult,
} from './payment.types'

/**
 * Whether the env-mock MercadoPago gateway is active.
 *
 * BLOCKER fix: the mock gateway processes every webhook inline with a fake
 * gateway and no pg-boss, bypassing the real payment flow entirely. It must be
 * impossible to enable in production even if `MP_MOCK_MODE=1` leaks into a prod
 * deploy — so the flag is hard-gated behind `isNonProductionRuntime`.
 */
export function computeMpMockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MP_MOCK_MODE === '1' && isNonProductionRuntime(env)
}

export const MP_MOCK_ENABLED = computeMpMockEnabled()

export type MockOutcome = 'approved' | 'rejected'

// Deterministic mpPaymentId that encodes outcome + bookingId so getPaymentStatus
// can return externalReference without DB access.
export function buildMockPaymentId(outcome: MockOutcome, bookingId: string): string {
  return `MOCK-${outcome.toUpperCase()}-${bookingId}`
}

export function parseMockPaymentId(id: string): { outcome: MockOutcome; bookingId: string } | null {
  const m = /^MOCK-(APPROVED|REJECTED)-([0-9a-fA-F-]{36})$/.exec(id)
  if (!m) return null
  return { outcome: m[1]!.toLowerCase() as MockOutcome, bookingId: m[2]! }
}

export function buildMockEventId(bookingId: string, outcome: MockOutcome): string {
  return `mock-evt-${outcome}-${bookingId}`
}

function mockCheckoutInitPoint(appUrl: string, bookingId: string, prefId: string): string {
  return `${appUrl}/mock-mp/checkout?booking=${bookingId}&pref=${encodeURIComponent(prefId)}`
}

// Env-mock gateway used ONLY when MP_MOCK_MODE=1. Returns a LOCAL checkout
// init point and decodes payment status from the mock payment id. Keeps the
// shared MockGateway (tests) untouched.
export class LocalMockGateway implements PaymentGateway {
  async createPreference(input: CreatePreferenceInput): Promise<PreferenceResult> {
    const prefId = `mock-pref-${input.bookingId}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const initPoint = mockCheckoutInitPoint(appUrl, input.bookingId, prefId)
    return { preferenceId: prefId, initPoint, sandboxInitPoint: initPoint }
  }

  async getPaymentStatus(mpPaymentId: string): Promise<GatewayPaymentInfo> {
    const parsed = parseMockPaymentId(mpPaymentId)
    if (!parsed) {
      // Unknown id in mock mode → treat as pending (no transition).
      return {
        mpPaymentId,
        status: 'pending',
        amount: 0,
        externalReference: '',
        paymentMethodId: 'mock',
      }
    }
    // El monto real de la seña vive en `bookings.deposit_amount` — un valor fijo
    // acá (antes 1) queda menor que la seña real y `prepareRefund` explota con
    // RefundAmountExceedsOriginalError al cancelar. Bypass RLS (worker pool):
    // este gateway solo existe fuera de producción (isNonProductionRuntime).
    const db = getWorkerDb()
    const rows = (await db.execute(sql`
      SELECT deposit_amount AS "depositAmount" FROM bookings WHERE id = ${parsed.bookingId} LIMIT 1
    `)) as unknown as Array<{ depositAmount: number }>
    const amount = rows[0]?.depositAmount ?? 0
    return {
      mpPaymentId,
      status: parsed.outcome === 'approved' ? 'approved' : 'rejected',
      amount,
      externalReference: parsed.bookingId,
      paymentMethodId: 'mock',
    }
  }

  async searchPaymentsByReference(_externalReference: string): Promise<GatewayPaymentInfo[]> {
    return []
  }

  // ─── SaaS recurring billing (P18) ────────────────────────────────────────

  async createPreapproval(input: CreatePreapprovalInput): Promise<PreapprovalResult> {
    const id = `mock-preapp-${input.tenantId}`
    return {
      preapprovalId: id,
      initPoint: `http://localhost:3000/mock-mp/preapproval?id=${id}`,
    }
  }

  async cancelPreapproval(_preapprovalId: string): Promise<void> {
    // no-op in mock mode
  }

  /**
   * `createPreapproval` arma el id como `mock-preapp-<tenantId>`, así que la
   * resolución es su inversa exacta: mismo contrato que en producción (el
   * complejo sale del preapproval, no del query de la URL) sin llamar a MP.
   */
  async resolveSubscriptionTenant(
    _eventType: 'subscription_preapproval' | 'subscription_authorized_payment',
    dataId: string,
  ): Promise<string | null> {
    const prefijo = 'mock-preapp-'
    return dataId.startsWith(prefijo) ? dataId.slice(prefijo.length) : null
  }

  /**
   * En mock mode la factura del mes no existe como entidad aparte: se
   * devuelve un cobro aprobado por el mismo id, que es lo que necesita el
   * handler para activar la suscripción en un E2E.
   */
  async getSubscriptionChargeInfo(authorizedPaymentId: string): Promise<GatewayPaymentInfo> {
    return {
      mpPaymentId: `mock-pay-${authorizedPaymentId}`,
      status: 'approved',
      amount: 0,
      externalReference: '',
      paymentMethodId: 'mock',
      preapprovalId: null,
    }
  }

  /**
   * `null` = "MP no reconoce este preapproval", que es lo que hace al
   * reconciliador saltear la fila sin tocarla. En mock mode no hay una cuenta
   * real contra la cual conciliar, y devolver un estado inventado activaría
   * suscripciones que nadie pagó.
   */
  async getSubscriptionState(_preapprovalId: string): Promise<GatewaySubscriptionState | null> {
    return null
  }

  async updatePreapprovalAmount(_preapprovalId: string, _amount: number): Promise<void> {
    // no-op in mock mode
  }

  async createSaasUpgradePreference(
    input: CreateSaasUpgradePreferenceInput,
  ): Promise<PreferenceResult> {
    const prefId = `mock-upgrade-pref-${input.tenantId}-${input.targetPlanId}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const initPoint = `${appUrl}/mock-mp/checkout?pref=${encodeURIComponent(prefId)}`
    return { preferenceId: prefId, initPoint, sandboxInitPoint: initPoint }
  }
}
