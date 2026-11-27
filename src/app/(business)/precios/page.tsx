import { connection } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { buildMetadata } from '@/lib/seo/metadata'
import { catalogPricing } from '@/modules/billing/pricing'
import { getDb } from '@/shared/db/client'
import { plans } from '@/shared/db/schema/plans'
import { withTimeout } from '@/shared/utils/async'
import { PreciosView } from './PreciosView'

// La base pública sale del mismo catálogo que la calculadora.
export const metadata = buildMetadata({
  title: 'Precios para complejos de fútbol',
  description:
    'Precios de TurnoGol para complejos de fútbol según la cantidad de canchas. Sin comisión por reserva de TurnoGol.',
  path: '/precios',
})

export default async function PreciosPage() {
  await connection()
  const [plan] = await withTimeout(
    getDb()
      .select({
        slug: plans.slug,
        priceFirstCourtCents: plans.priceFirstCourtCents,
        priceExtraCourtCents: plans.priceExtraCourtCents,
        annualDiscountBps: plans.annualDiscountBps,
      })
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(asc(plans.sortOrder))
      .limit(1),
    3000,
  ).catch(() => [])
  const pricing = plan ? catalogPricing(plan) : null
  return <PreciosView pricing={pricing} />
}
