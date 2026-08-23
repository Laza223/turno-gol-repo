import { Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { listPendingRefunds } from '@/modules/payments/refund.service'
import { CajaTabs } from '../components/CajaTabs'
import { requireCajaContext } from '../queries'
import { PendingRefundsList } from './PendingRefundsList'
import { markRefundSettledAction } from './actions'

/**
 * Devoluciones de seña que el complejo todavía debe.
 *
 * El reembolso automático vía API de MercadoPago falla siempre (403: MP deriva
 * los permisos del producto de la aplicación y ninguno concede el de
 * reembolsos), así que la devolución la hace el complejo. Esta pantalla es
 * donde se entera de que la debe y donde marca que la hizo.
 *
 * Vive al lado de "Plata en la calle" y no adentro a propósito: aquella suma lo
 * que le DEBEN al complejo y es la fuente única de ese total. Esto es lo
 * contrario. Mezclarlos rompería el invariante que compara las dos rutas de
 * ese número.
 */
export default async function CajaDevolucionesPage() {
  const { tenant } = await requireCajaContext()

  const rows = await withTenantContext(tenant.id, (tx) => listPendingRefunds(tenant.id, tx))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devoluciones pendientes"
        subtitle="Señas que tenés que devolverle a un jugador. Marcá cada una cuando ya la hayas devuelto."
        icon={<Undo2 className="h-6 w-6" aria-hidden="true" />}
      />

      <div className="card-entrance">
        <CajaTabs active="/caja/devoluciones" />
      </div>

      <div className="card-entrance" style={{ animationDelay: '80ms' }}>
        <PendingRefundsList rows={rows} action={markRefundSettledAction} />
      </div>
    </div>
  )
}
