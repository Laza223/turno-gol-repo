import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { listOpenTabs } from '@/modules/canteen/canteen-tab.service'
import { getCashFlows } from '@/modules/cashflow/cashflow.service'
import { formatArs } from '@/lib/format'
import { CajaTabs } from './components/CajaTabs'
import { TicketPanel } from './cantina/TicketPanel'
import { MovementsList } from './cantina/MovementsList'
import { createTabAction, sellTicketAction } from './cantina/actions'
import { countLowStock } from './caja-lib'
import { requireCajaContext } from './queries'

/**
 * Cuántos movimientos acompañan a la venta. Tres y no cinco: con cinco la
 * pantalla scrolleaba 114 px a 1440×900, y para contestar "¿entró la venta que
 * acabo de hacer?" alcanza con ver las últimas.
 */
const RECENT_MOVEMENTS = 3

/**
 * Vender: la caja registradora del mostrador.
 *
 * Acá no hay nada que no sea vender. No hay `PageHeader` (120 px que no decían
 * nada: el menú ya dice "Caja" y la pestaña activa dice "Vender") y no hay
 * totales del día — eso se mira una o dos veces por día y vive en
 * /caja/cuentas. Esta pantalla se usa de pie, con una mano y con gente
 * esperando: lo que no es la venta empuja la venta abajo del pliegue.
 *
 * Lo que SÍ acompaña a la venta son los últimos movimientos. No es un
 * informe: es el acuse de recibo del cobro que se acaba de hacer, la única
 * forma de contestar "¿entró?" o "¿lo cargué dos veces?" sin salir de la
 * pantalla. Tres y no todos, y `LIMIT` en la consulta y no un `slice`: un
 * sábado de torneo son decenas de filas para mostrar tres.
 *
 * Los fiados abiertos dejaron de ser una lista acá y quedaron en una línea que
 * linkea a Cuentas: cobrarlos es la misma acción que cobrar cualquier otra
 * deuda, ya vive allá con su buscador, y tener DOS lugares donde se cobra un
 * fiado es lo que hace que un día no cierre.
 */
export default async function CajaPage(props: {
  searchParams: Promise<{ configureCanteen?: string }>
}) {
  const searchParams = await props.searchParams

  // Compat con deep links viejos: la configuración de productos vive en su propia tab.
  if (searchParams.configureCanteen === 'true') {
    redirect('/caja/productos?configureCanteen=true')
  }

  const { tenant, cutoffMins, today } = await requireCajaContext()

  const { products, tabs, cashFlows } = await withTenantContext(tenant.id, async (tx) => {
    const [p, t, cf] = await Promise.all([
      listProducts(tenant.id, tx),
      listOpenTabs(tenant.id, tx),
      // `+ 1`: la fila sobrante dice si hay más para ver en Cuentas.
      getCashFlows(tenant.id, today, cutoffMins, tx, { limit: RECENT_MOVEMENTS + 1 }),
    ])
    return { products: p, tabs: t, cashFlows: cf }
  })

  const tabsTotal = tabs.reduce((sum, t) => sum + t.totalAmount, 0)

  // Sin `card-entrance` (a diferencia de Cuentas y Productos): es una entrada
  // escalonada de 400 ms en la pantalla que se abre decenas de veces por noche,
  // y su `transform` final envolvería a la barra de cobro `sticky` del teléfono.
  // Una animación de bienvenida en la caja registradora es justo lo que este
  // rediseño viene a sacar.
  return (
    <div className="space-y-6">
      <CajaTabs active="/caja" lowStock={countLowStock(products)} />

      <Suspense fallback={null}>
        <TicketPanel
          products={products}
          sellTicketAction={sellTicketAction}
          createTabAction={createTabAction}
        />
      </Suspense>

      {tabs.length > 0 && (
        <Link
          href="/caja/cuentas"
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-foreground">
            {tabs.length} {tabs.length === 1 ? 'fiado abierto' : 'fiados abiertos'} ·{' '}
            <span className="font-semibold tabular-nums">{formatArs(tabsTotal)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
            Cobrar en Cuentas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </Link>
      )}

      <MovementsList
        cashFlows={cashFlows.slice(0, RECENT_MOVEMENTS)}
        heading="Últimos movimientos"
        emptyDescription="Los cobros de reservas y las ventas de cantina van a aparecer acá apenas se registren."
        // En el encabezado y no como pie: un renglón menos, y el alto que
        // ahorra es el que deja a la pantalla entera sin scroll.
        actions={
          cashFlows.length > RECENT_MOVEMENTS ? (
            <Link
              href="/caja/cuentas"
              className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
            >
              Ver todos los del día
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null
        }
      />
    </div>
  )
}
