import type { PricingParams } from '@/modules/billing/pricing'

/**
 * Las tres columnas de precio por cancha, tal como vienen de `plans` (migr.
 * 090). Son nullable en el tipo porque las tres filas viejas (Predio /
 * Complejo / Estadio, hoy `is_active = false`) no las tienen: la fila activa
 * `turnogol` es la única que las trae cargadas.
 */
type PlanPricingColumns = {
  priceFirstCourtCents: number | null
  priceExtraCourtCents: number | null
  annualDiscountBps: number | null
}

/**
 * Parámetros de precio del primer plan activo que los tenga completos.
 *
 * Devuelve `null` en vez de asumir defaults: un precio inventado en el
 * cliente es plata real cobrada de menos o de más. Si esto da `null`, la
 * pantalla muestra el estado de la suscripción sin ofrecer activar nada.
 *
 * Existe acá —y no dentro del componente— porque las dos páginas que montan
 * la cuota (`/settings/facturacion` y `/reactivar`) son Server Components y
 * necesitan decidir QUÉ renderizar antes de llegar al cliente. Por eso este
 * archivo no lleva `'use client'`.
 */
export function firstCuotaPricing(plans: readonly PlanPricingColumns[]): PricingParams | null {
  for (const plan of plans) {
    const { priceFirstCourtCents, priceExtraCourtCents, annualDiscountBps } = plan
    if (priceFirstCourtCents === null || priceExtraCourtCents === null) continue
    if (annualDiscountBps === null) continue
    return { priceFirstCourtCents, priceExtraCourtCents, annualDiscountBps }
  }
  return null
}
