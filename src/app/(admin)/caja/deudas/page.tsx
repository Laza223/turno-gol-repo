import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { getStreetMoney } from '@/modules/cashflow/street-money.service'
import { CajaTabs } from '../components/CajaTabs'
import { requireCajaContext } from '../queries'
import { StreetMoneyList } from './StreetMoneyList'

/**
 * "Plata en la calle" (Fase 1, criterio de salida #2 del contrato): turnos
 * jugados sin cobrar + fiados de cantina abiertos + cuotas de torneo
 * impagas, en una sola lista con "Cobrar" por fila. Tenant-wide, no depende
 * de la fecha seleccionada en /caja (a diferencia de los movimientos del
 * día) — es la MISMA función (getStreetMoney) que alimenta el número del
 * encabezado perpetuo de /caja.
 */
export default async function CajaDeudasPage() {
  const { tenant } = await requireCajaContext()

  const rows = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plata en la calle"
        subtitle="Turnos jugados sin cobrar, fiados abiertos y cuotas de torneo impagas — todo en un solo lugar."
        icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
      />

      <div className="card-entrance">
        <CajaTabs active="/caja/deudas" />
      </div>

      <div className="card-entrance" style={{ animationDelay: '80ms' }}>
        <StreetMoneyList rows={rows} />
      </div>
    </div>
  )
}
