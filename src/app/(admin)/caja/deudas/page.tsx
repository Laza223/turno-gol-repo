import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { withTenantContext } from '@/shared/db/client'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  STREET_MONEY_DEFAULT_MONTHS,
} from '@/modules/cashflow/street-money-window'
import { track } from '@/shared/observability/breadcrumbs'
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
export default async function CajaDeudasPage(props: { searchParams: Promise<{ todas?: string }> }) {
  const { tenant } = await requireCajaContext()
  const searchParams = await props.searchParams

  // B11: por defecto los últimos 12 meses. La deuda vieja NO desaparece ni deja
  // de deberse — `?todas=1` la trae entera. Ver street-money-window.ts.
  const showAll = searchParams.todas === '1'
  const window = showAll ? 'all' : DEFAULT_STREET_MONEY_WINDOW

  const rows = await withTenantContext(tenant.id, (tx) => getStreetMoney(tenant.id, tx, window))
  // Proxy "plata en la calle: tendencia ↓ por tenant" (§11) — misma fuente
  // (getStreetMoney) que el número del encabezado de /caja, así que el dato
  // instrumentado nunca puede divergir del que ve la pantalla.
  track.cashflow('street_money.viewed', { tenantId: tenant.id, totalCents: sumStreetMoney(rows) })

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

      {/* El rótulo dice qué se está viendo SIEMPRE, no solo cuando hay algo
          escondido: una pantalla de plata que muestra una ventana sin decirlo se
          lee como "esto es todo lo que me deben". */}
      <p className="text-center text-sm text-muted-foreground">
        {showAll ? (
          <>
            Mostrando <strong className="text-foreground">toda</strong> la deuda registrada.{' '}
            <Link
              href="/caja/deudas"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Ver solo los últimos {STREET_MONEY_DEFAULT_MONTHS} meses
            </Link>
          </>
        ) : (
          <>
            Mostrando los últimos{' '}
            <strong className="text-foreground">{STREET_MONEY_DEFAULT_MONTHS} meses</strong>.{' '}
            <Link
              href="/caja/deudas?todas=1"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Ver deuda anterior
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
