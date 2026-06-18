/**
 * Money conversions between MercadoPago's decimal-peso amounts and our internal
 * integer-cents representation (montos en centavos de ARS, CLAUDE.md).
 *
 * Kept dependency-free so it can be unit-tested directly without loading the MP
 * SDK or any tenant context. The gateway implementation imports these.
 */

/** MP webhook decimal pesos → integer cents. Returns 0 for non-finite/non-number. */
export function pesosToCents(amount: number | undefined | null): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

/** Integer cents → decimal pesos for outbound MP calls (unit_price, refund amount). */
export function centsToPesos(cents: number): number {
  return Math.round(cents) / 100
}
