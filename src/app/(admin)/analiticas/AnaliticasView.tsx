import type { ComponentProps } from 'react'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import type { RevenueReport } from '@/modules/reports/report.types'
import { ExportCsvButton } from './ExportCsvButton'
import MetricsDashboard from './MetricsDashboard'
import { MethodSummary, MonthBoard, MonthEmpty } from './MonthBoard'
import { MonthStepper } from './MonthStepper'

/**
 * Lo que dibuja `/analiticas`, separado de la página para que la story use la
 * misma composición (la página es async y lee la base). Ver el comentario de
 * `page.tsx` para qué muestra y por qué.
 */
export function AnaliticasView({
  report,
  month,
  isCurrent,
  isEmpty,
  canSeeSystem,
  stepper,
  csv,
}: {
  report: RevenueReport
  /** 'YYYY-MM' elegido. */
  month: string
  /** Es el mes en curso (en día operativo del complejo). */
  isCurrent: boolean
  isEmpty: boolean
  canSeeSystem: boolean
  stepper: Omit<ComponentProps<typeof MonthStepper>, 'className'>
  /** Días operativos del mes, inclusive, para el export. */
  csv: { from: string; to: string }
}) {
  return (
    <div className="space-y-5">
      {/* La barra es navegación: el título lo tiene que encontrar igual el lector de pantalla. */}
      <h1 className="sr-only">Métricas</h1>
      <AdminHeaderSlot>
        <MonthStepper {...stepper} className="hidden lg:flex" />
        {/* Sin movimientos no hay nada que exportar. */}
        {!isEmpty && (
          <ExportCsvButton from={csv.from} to={csv.to} className="ml-auto hidden lg:inline-flex" />
        )}
      </AdminHeaderSlot>
      <MonthStepper {...stepper} className="-mx-2 lg:hidden" />

      {isEmpty ? (
        <MonthEmpty month={month} isCurrent={isCurrent} />
      ) : (
        <MonthBoard report={report} month={month} isCurrent={isCurrent} />
      )}

      {/* Un bloque ausente no deja hueco: `empty:hidden` (sin hijos no hay fila). */}
      <div className="grid grid-cols-1 items-start gap-5 empty:hidden lg:grid-cols-2">
        {!isEmpty && <MethodSummary report={report} />}
        {(isCurrent || canSeeSystem) && (
          <MetricsDashboard canSeeSystem={canSeeSystem} showRecent={isCurrent} />
        )}
      </div>

      {!isEmpty && <ExportCsvButton from={csv.from} to={csv.to} className="w-full lg:hidden" />}
    </div>
  )
}
