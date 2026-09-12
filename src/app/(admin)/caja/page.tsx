import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { withTenantContext } from '@/shared/db/client'
import { listProducts } from '@/modules/canteen/canteen.service'
import { listOpenTabs } from '@/modules/canteen/canteen-tab.service'
import { CajaTabs } from './components/CajaTabs'
import { TicketPanel } from './cantina/TicketPanel'
import { FiadosList } from './cantina/FiadosList'
import {
  createTabAction,
  sellTicketAction,
  settleTabAction,
  cancelTabAction,
} from './cantina/actions'
import { requireCajaContext } from './queries'

/**
 * Vender: la caja registradora del mostrador.
 *
 * Acá no hay nada que no sea vender o cobrar un fiado. No hay `PageHeader`
 * (120 px que no decían nada: el menú ya dice "Caja" y la pestaña activa dice
 * "Vender"), no hay totales del día y no hay diario de movimientos — todo eso
 * se mira una o dos veces por día y vive en /caja/cuentas. Esta pantalla se usa
 * de pie, con una mano y con gente esperando: lo que no es la venta empuja la
 * venta abajo del pliegue.
 *
 * Por eso también carga dos cosas y no ocho: el catálogo y los fiados abiertos.
 */
export default async function CajaPage(props: {
  searchParams: Promise<{ configureCanteen?: string }>
}) {
  const searchParams = await props.searchParams

  // Compat con deep links viejos: la configuración de productos vive en su propia tab.
  if (searchParams.configureCanteen === 'true') {
    redirect('/caja/productos?configureCanteen=true')
  }

  const { tenant } = await requireCajaContext()

  const { products, tabs } = await withTenantContext(tenant.id, async (tx) => {
    const [p, t] = await Promise.all([listProducts(tenant.id, tx), listOpenTabs(tenant.id, tx)])
    return { products: p, tabs: t }
  })

  // Sin `card-entrance` (a diferencia de Cuentas y Productos): es una entrada
  // escalonada de 400 ms en la pantalla que se abre decenas de veces por noche,
  // y su `transform` final envolvería a la barra de cobro `sticky` del teléfono.
  // Una animación de bienvenida en la caja registradora es justo lo que este
  // rediseño viene a sacar.
  return (
    <div className="space-y-4">
      <CajaTabs active="/caja" />

      <Suspense fallback={null}>
        <TicketPanel
          products={products}
          sellTicketAction={sellTicketAction}
          createTabAction={createTabAction}
        />
      </Suspense>

      <FiadosList tabs={tabs} settleTabAction={settleTabAction} cancelTabAction={cancelTabAction} />
    </div>
  )
}
