import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import type { PaymentGateway } from './mp-gateway'
import type {
  CreatePreapprovalInput,
  CreatePreferenceInput,
  CreateSaasUpgradePreferenceInput,
  GatewayPaymentInfo,
  PreapprovalResult,
  PreferenceResult,
  RefundResult,
} from './payment.types'

/**
 * True when this process is NOT the real production deploy. Vercel sets
 * `NODE_ENV=production` for EVERY deployed build, including Preview/staging
 * (see scripts/seed-staging.ts's own note on this) — so `NODE_ENV` alone
 * can't tell a Preview deploy from the real thing. `VERCEL_ENV` can:
 * it's `'production'` ONLY for the actual Production environment and
 * `'preview'` for every other Vercel deployment, so OR-ing in
 * `VERCEL_ENV === 'preview'` only ever widens this for non-prod deploys —
 * it can never itself evaluate true on the real prod domain.
 */
export function isNonProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.VERCEL_ENV === 'preview'
}

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
    // acá (antes 1) queda menor que la seña real y `createRefund` explota con
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

  async createRefund(mpPaymentId: string, _amount?: number): Promise<RefundResult> {
    return { mpRefundId: `mock-refund-${mpPaymentId}`, status: 'approved' }
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
