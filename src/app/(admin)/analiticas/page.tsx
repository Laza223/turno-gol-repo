import { requireAdminStaff } from '@/modules/staff/guards'
import { resolveSystemAdmin } from '@/modules/auth/system-admin.guards'
import { getRevenueReport } from '@/modules/reports/report.service'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import {
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
  isReportEmpty,
} from '@/modules/reports/report.utils'
import { AnaliticasView } from './AnaliticasView'

/**
 * Mes actual EN DÍA OPERATIVO del complejo.
 *
 * Con `getUTCMonth()` —que es lo que había acá— a las 22:00 ART del último día
 * del mes la página se abría mostrando el mes SIGUIENTE, vacío, como si el
 * complejo no hubiera facturado nada. Justo en el horario en que el dueño mira
 * el teléfono.
 */
function currentMonthStr(cutoffMins: number): string {
  return operatingDateOf(new Date(), cutoffMins).slice(0, 7)
}

function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/**
 * Métricas (/analiticas): el mes que se elige con las flechas de la barra, en
 * una sola página (variante "Canchas primero", elegida por el dueño el
 * 2026-09-26). Arriba cuánto entró y cada cancha de la que más cobró a la que
 * menos; abajo por dónde entró y, solo en el mes en curso, los últimos 30 días
 * (horarios y ausencias), que salen de otra consulta y se refrescan solos.
 * Antes eran dos mitades con ventanas distintas y "Ingresos" dos veces (H032).
 *
 * Zona sensible (ingresos visibles), SOLO DEL DUEÑO (2026-09-19): el guard es el
 * `requireAdminStaff()` de ESTA página (más abajo), no algo del layout de
 * (admin) — el layout solo resuelve `getStaffRole` para el chrome, no corta el
 * acceso. La versión previa
 * de este comentario decía "el layout" y antes de eso "va detrás del PinGate"
 * (`PinGate` nunca existió en el repo: el sistema de PIN se eliminó con el modelo
 * de 2 roles). Un comentario que promete una barrera que está en otro lado es
 * peor que no tener comentario: mandó a auditar el layout dos veces.
 *
 * El panel "Estado del sistema" se renderiza solo para superadministradores de la plataforma.
 */
export default async function AnaliticasPage(props: {
  searchParams: Promise<{ month?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  // El Encargado rebota a /dashboard (default de requireAdminStaff), que ahora
  // también es suya: no hay loop.
  const { tenant } = await requireAdminStaff()

  const systemAdmin = await resolveSystemAdmin()
  const canSeeSystem = systemAdmin !== null

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const thisMonth = currentMonthStr(cutoffMins)
  const rawMonth = typeof searchParams.month === 'string' ? searchParams.month : ''
  // Un mes futuro escrito a mano cae al mes en curso, igual que uno inválido:
  // mostrado como mes cerrado decía "no hubo cobros" de algo que no pasó.
  const month = isValidMonth(rawMonth) && rawMonth <= thisMonth ? rawMonth : thisMonth
  const isCurrent = month === thisMonth
  const bounds = getMonthBounds(month, cutoffMins)

  const report = await getRevenueReport(
    tenant.id,
    month,
    tenant.openingHours,
    tenant.closedDates,
    tenant.closesNextDay,
  )

  const isEmpty = isReportEmpty(report)

  // El CSV cubre [primer día, último día] del mes, inclusive — en días
  // operativos, que es lo que la ruta de export vuelve a convertir a instantes.
  const csvFrom = bounds.fromDate
  const csvTo = new Date(new Date(`${bounds.toDate}T12:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10)

  const stepper = {
    label: formatMonthLabel(month),
    prevHref: `/analiticas?month=${prevMonthStr(month)}`,
    nextHref: isCurrent ? null : `/analiticas?month=${nextMonthStr(month)}`,
  }

  return (
    <AnaliticasView
      report={report}
      month={month}
      isCurrent={isCurrent}
      isEmpty={isEmpty}
      canSeeSystem={canSeeSystem}
      stepper={stepper}
      csv={{ from: csvFrom, to: csvTo }}
    />
  )
}
