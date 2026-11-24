import { catalogPricing, type PricingParams } from '@/modules/billing/pricing'

export function firstCuotaPricing(
  plans: readonly Parameters<typeof catalogPricing>[0][],
): PricingParams | null {
  for (const plan of plans) {
    const pricing = catalogPricing(plan)
    if (pricing) return pricing
  }
  return null
}
