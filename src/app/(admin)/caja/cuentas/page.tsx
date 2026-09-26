import Link from 'next/link'
import { withTenantContext } from '@/shared/db/client'
import { countCashFlows, getCashFlows, getDaySummary } from '@/modules/cashflow/cashflow.service'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  STREET_MONEY_DEFAULT_MONTHS,
} from '@/modules/cashflow/street-money-window'
import { lowStockCount } from '@/modules/canteen/canteen.service'
import { listPendingRefunds } from '@/modules/payments/refund.service'
import { track } from '@/shared/observability/breadcrumbs'
import { Pager } from '@/components/ui/pager'
import { CajaTabs } from '../components/CajaTabs'
import { AddMovementButton } from '../cantina/AddMovementButton'
import { PendingRefundsList } from '../devoluciones/PendingRefundsList'
import { markRefundSettledAction } from '../devoluciones/actions'
import { createCashFlowAction } from '../actions'
import { requireCajaContext } from '../queries'
import { addDays, parseCajaDay, shortDateLabel } from '../caja-lib'
import { CuentasPending } from './CuentasPending'
import { DayStepper } from './DayStepper'
import { NightLedger } from './NightLedger'
import { NightSummary } from './NightSummary'
import { toLedgerRow } from './ledger'

/**
 * Movimientos por página. Una noche entera entra en una (en el Vagón, entre 36 y
 * 70): el libro se agrupa por hora y se filtra sobre lo que trae la página.
 */
const MOVEMENTS_PAGE_SIZE = 100

/** `?mov=` es 1-based en la URL (igual que `?pagina=` de /jugadores). Basura → 1. */
function parseMovementsPage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 1 ? n - 1 : 0
}

/**
 * Cuentas: el libro de la noche (diseño elegido por el dueño entre variantes el
 * 2026-09-25, `docs/decisions/2026-09-25-caja-libro-de-la-noche.md`).
 *
 * Arriba, cuánto entró y por dónde. Después, lo que falta cobrar en un renglón
 * por tipo (fiados y turnos no cobrados), que abre su lista en un modal. Y
 * abajo, a todo el ancho, los movimientos del día agrupados por hora. Antes los
 * movimientos quedaban detrás de una tabla de 25 filas de lo sin cobrar, y en
 * el teléfono, al final de todo.
 *
 * El día es el OPERATIVO del complejo (`cutoffMins`) y se cambia con las flechas:
 * a la hora del corte la noche que terminó pasa a "Ayer" en vez de desaparecer.
 * Lo sin cobrar no depende del día que se mira: es todo lo pendiente.
 */
export default async function CajaCuentasPage(props: {
  searchParams: Promise<{ todas?: string; mov?: string; dia?: string }>
}) {
  const { tenant, cutoffMins, today } = await requireCajaContext()
  const searchParams = await props.searchParams

  // B11: por defecto los últimos 12 meses. Lo viejo NO desaparece ni deja de
  // deberse — `?todas=1` lo trae entero. Ver street-money-window.ts.
  const showAll = searchParams.todas === '1'
  const window = showAll ? 'all' : DEFAULT_STREET_MONEY_WINDOW
  const movPage = parseMovementsPage(searchParams.mov)
  const day = parseCajaDay(searchParams.dia, today)
  const isToday = day === today

  const { summary, movRows, movTotal, streetMoneyRows, refunds, lowStock } =
    await withTenantContext(tenant.id, async (tx) => {
      const [s, cf, n, sm, rf, ls] = await Promise.all([
        getDaySummary(tenant.id, day, cutoffMins, tx),
        getCashFlows(tenant.id, day, cutoffMins, tx, {
          limit: MOVEMENTS_PAGE_SIZE,
          offset: movPage * MOVEMENTS_PAGE_SIZE,
        }),
        // El total del paginador: "Mostrando 101–140 de 140".
        countCashFlows(tenant.id, day, cutoffMins, tx),
        getStreetMoney(tenant.id, tx, window),
        listPendingRefunds(tenant.id, tx),
        // Cuentas no carga el catálogo: el aviso de stock sale de un COUNT.
        lowStockCount(tenant.id, tx),
      ])
      return {
        summary: s,
        movRows: cf,
        movTotal: n,
        streetMoneyRows: sm,
        refunds: rf,
        lowStock: ls,
      }
    })

  // Proxy "plata en la calle: tendencia ↓ por tenant" (§11) — misma fuente que
  // la pantalla, así que el dato instrumentado nunca puede divergir del que se ve.
  track.cashflow('street_money.viewed', {
    tenantId: tenant.id,
    totalCents: sumStreetMoney(streetMoneyRows),
  })

  /** La URL de Cuentas con sus tres estados. Cambiar de día vuelve a la primera página. */
  function cuentasHref({
    all = showAll,
    mov = movPage,
    dia = day,
  }: {
    all?: boolean
    mov?: number
    dia?: string
  }) {
    const qs = new URLSearchParams()
    if (dia !== today) qs.set('dia', dia)
    if (all) qs.set('todas', '1')
    if (mov > 0) qs.set('mov', String(mov + 1))
    const s = qs.toString()
    return s ? `/caja/cuentas?${s}` : '/caja/cuentas'
  }

  const yesterday = addDays(today, -1)
  const dayName = shortDateLabel(day)
  const stepper = {
    label: isToday ? `Hoy · ${dayName}` : day === yesterday ? `Ayer · ${dayName}` : dayName,
    prevHref: cuentasHref({ dia: addDays(day, -1), mov: 0 }),
    nextHref: isToday ? null : cuentasHref({ dia: addDays(day, 1), mov: 0 }),
  }
  const heading = isToday ? 'Entró hoy' : day === yesterday ? 'Entró ayer' : `Entró el ${dayName}`

  return (
    <div className="space-y-5">
      {/* Las flechas de día cuelgan de la barra superior en escritorio; en el
          teléfono no entran al lado de las pestañas y bajan al cuerpo. */}
      <CajaTabs
        active="/caja/cuentas"
        lowStock={lowStock}
        actions={<DayStepper {...stepper} className="hidden lg:flex" />}
      />
      <DayStepper {...stepper} className="-mx-2 lg:hidden" />

      <PendingRefundsList rows={refunds} action={markRefundSettledAction} />

      <NightSummary heading={heading} summary={summary} />

      <CuentasPending
        rows={streetMoneyRows}
        windowNote={
          showAll ? (
            <>
              Se ve todo lo registrado.{' '}
              <Link
                href={cuentasHref({ all: false })}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Ver solo los últimos {STREET_MONEY_DEFAULT_MONTHS} meses
              </Link>
            </>
          ) : (
            <>
              Se ven los últimos {STREET_MONEY_DEFAULT_MONTHS} meses.{' '}
              <Link
                href={cuentasHref({ all: true })}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Ver los anteriores
              </Link>
            </>
          )
        }
      />

      <NightLedger
        rows={movRows.map(toLedgerRow)}
        total={movTotal}
        actions={
          // Registrar un movimiento es cosa del día que corre: en un día pasado
          // quedaría con la hora de ahora y fuera de ese día.
          isToday && (
            <AddMovementButton
              variant="ghost"
              label="Registrar movimiento"
              date={today}
              cutoffMins={cutoffMins}
              createCashFlowAction={createCashFlowAction}
            />
          )
        }
        {...(movPage > 0 && movRows.length === 0
          ? {
              // Página fuera de rango (`?mov=9` de un link viejo): no es "sin
              // movimientos", es "esa página no existe".
              emptyTitle: 'Esa página no existe',
              emptyDescription: 'El día tiene menos movimientos que los que pide el link.',
            }
          : isToday
            ? {
                emptyTitle: 'Todavía no entró plata hoy',
                emptyDescription:
                  'Los cobros de turnos y las ventas de cantina aparecen acá a medida que se registran.',
              }
            : {
                emptyTitle: 'Ese día no se registró plata',
                emptyDescription: 'No hay cobros, ventas ni gastos en ese día.',
              })}
        footer={
          movTotal > MOVEMENTS_PAGE_SIZE && (
            <Pager
              label="Paginación de movimientos del día"
              page={movPage}
              total={movTotal}
              pageSize={MOVEMENTS_PAGE_SIZE}
              shown={movRows.length}
              hrefFor={(page) => cuentasHref({ mov: page })}
            />
          )
        }
      />
    </div>
  )
}
