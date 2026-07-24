import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { getDailyClose } from '@/modules/cashflow/daily-close.service'
import { listProducts } from '@/modules/canteen/canteen.service'
import { listOpenTabs } from '@/modules/canteen/canteen-tab.service'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { CajaTabs } from '../components/CajaTabs'
import { TicketPanel } from './TicketPanel'
import { FiadosList } from './FiadosList'
import { createTabAction, sellTicketAction, settleTabAction, cancelTabAction } from './actions'

export default async function CajaCantinaPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // La venta de cantina es siempre "ahora": a diferencia de /caja, esta tab
  // no navega por fecha (?date=).
  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const today = operatingDateOf(new Date(), cutoffMins)
  const { close, products, tabs } = await withTenantContext(tenant.id, async (tx) => {
    const [c, p, t] = await Promise.all([
      getDailyClose(tenant.id, today, tx),
      listProducts(tenant.id, tx),
      listOpenTabs(tenant.id, tx),
    ])
    return { close: c, products: p, tabs: t }
  })

  // Caja de hoy cerrada: vender y cobrar fiados quedan deshabilitados (banner
  // + props saleDisabled/settleDisabled), pero anotar un fiado nuevo sigue
  // permitido — createTab no toca caja (regla de negocio del design doc).
  const saleDisabled = close !== null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja y Cantina"
        subtitle="Venta rápida de cantina"
        icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
      />

      <CajaTabs active="/caja/cantina" />

      {saleDisabled && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-xs">
          La caja de hoy ya está cerrada. Podés anotar fiados; las ventas y cobros se habilitan con
          la caja abierta.{' '}
          <Link href="/caja" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Ver caja
          </Link>
        </div>
      )}

      <Suspense fallback={null}>
        <TicketPanel
          products={products}
          sellTicketAction={sellTicketAction}
          createTabAction={createTabAction}
          saleDisabled={saleDisabled}
        />
      </Suspense>

      <FiadosList
        tabs={tabs}
        settleTabAction={settleTabAction}
        cancelTabAction={cancelTabAction}
        settleDisabled={saleDisabled}
      />
    </div>
  )
}
