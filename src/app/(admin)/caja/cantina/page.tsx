import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDailyClose } from '@/modules/cashflow/daily-close.service'
import { artDateOf } from '@/shared/time/art-date'
import { CajaTabs } from '../components/CajaTabs'
import { CanteenQuickSale } from '../components/CanteenQuickSale'
import { sellCanteenProductAction } from '../actions'

export default async function CajaCantinaPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // La venta de cantina es siempre "ahora": a diferencia de /caja, esta tab
  // no navega por fecha (?date=).
  const today = artDateOf(new Date())
  const close = await withTenantContext(tenant.id, (tx) => getDailyClose(tenant.id, today, tx))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja y Cantina"
        subtitle="Venta rápida de cantina"
        icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
      />

      <CajaTabs active="/caja/cantina" />

      {close ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-xs">
          La caja de hoy ya está cerrada. Las ventas se registran cuando la caja está abierta.{' '}
          <Link href="/caja" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Ver caja
          </Link>
        </div>
      ) : (
        <Suspense fallback={null}>
          <CanteenQuickSale
            date={today}
            products={tenant.settings.canteen_products ?? []}
            sellCanteenProductAction={sellCanteenProductAction}
          />
        </Suspense>
      )}
    </div>
  )
}
