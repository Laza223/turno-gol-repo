import { CheckCircle2 } from 'lucide-react'
import { formatArsContable } from '@/lib/format'
import { closeView, formatTimeArt } from '../caja-lib'
import type { DailyCashCloseRow } from '@/modules/cashflow/cashflow.types'

/**
 * El artefacto del peak-end (pages/caja.md §5): resumen verde e inmutable del
 * cierre. Presentacional puro — recibe la fila de daily_cash_closes ya leída.
 * Bifurca legacy/v2 vía closeView (migr. 049): legacy mantiene el layout
 * histórico intacto; v2 agrega Fondo inicial/Efectivo esperado/Diferencia
 * como filas del <dl> (en vez del párrafo ámbar suelto, que solo persiste
 * en legacy).
 */
export function CierreCard({ close }: { close: DailyCashCloseRow }) {
  const view = closeView(close)
  const closedTime = formatTimeArt(close.closedAt)

  const title =
    view.variant === 'v2'
      ? `Caja cerrada — ${view.message}`
      : view.hasDiff
        ? 'Caja cerrada — con diferencia anotada'
        : view.hasCashCount
          ? 'Caja cerrada — el efectivo cuadró'
          : 'Caja cerrada'

  return (
    <section
      aria-label="Cierre del día"
      className="rounded-xl border border-emerald-600/30 bg-primary/5 p-5 shadow-xs dark:border-emerald-500/30 dark:bg-emerald-500/10"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-400"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cerrada a las {closedTime} hs. El día quedó bloqueado: los movimientos ya no se pueden
            tocar.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Ingresos</dt>
              {/* emerald-700 (idiom habitual admin/claro) da 4.12:1 acá — el
                  fondo real no es blanco sino bg-primary/5 sobre bg-background
                  (~#d7e1e6), por debajo del piso AA de 4.5. emerald-800 sube a
                  ~5.79:1 sobre ese mismo fondo (medido). */}
              <dd className="font-medium tabular-nums text-emerald-800 dark:text-emerald-400">
                +{formatArsContable(close.totalIncome + close.totalAdjustments)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Egresos</dt>
              <dd className="font-medium tabular-nums text-red-700 dark:text-red-400">
                −{formatArsContable(close.totalExpense)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Saldo neto</dt>
              <dd className="font-display font-bold tabular-nums text-foreground">
                {close.balance < 0
                  ? `−${formatArsContable(-close.balance)}`
                  : formatArsContable(close.balance)}
              </dd>
            </div>
            {view.variant === 'v2' && (
              <>
                <div>
                  <dt className="text-muted-foreground">Fondo inicial</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatArsContable(close.openingCash ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Efectivo esperado</dt>
                  <dd className="font-display font-bold tabular-nums text-foreground">
                    {formatArsContable(close.expectedCash ?? 0)}
                  </dd>
                </div>
              </>
            )}
            {view.hasCashCount && (
              <div>
                <dt className="text-muted-foreground">Efectivo contado</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {formatArsContable(close.declaredCash)}
                </dd>
              </div>
            )}
            {view.variant === 'v2' && view.hasCashCount && (
              <div>
                <dt className="text-muted-foreground">Diferencia</dt>
                <dd
                  className={`font-medium tabular-nums ${
                    view.hasDiff
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-emerald-800 dark:text-emerald-400'
                  }`}
                >
                  {close.diffAmount < 0
                    ? `−${formatArsContable(-close.diffAmount)}`
                    : `+${formatArsContable(close.diffAmount)}`}
                </dd>
              </div>
            )}
          </dl>
          {view.variant === 'legacy' && view.hasDiff && (
            <p className="mt-2 inline-flex rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
              Diferencia de{' '}
              {close.diffAmount < 0
                ? `−${formatArsContable(-close.diffAmount)}`
                : formatArsContable(close.diffAmount)}{' '}
              respecto del saldo.
            </p>
          )}
          {close.note && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Nota:</span> {close.note}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
