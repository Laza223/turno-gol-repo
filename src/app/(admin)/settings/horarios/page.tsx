import { CalendarOff } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { AddClosedDateForm } from './AddClosedDateForm'
import { HorariosForm } from './HorariosForm'
import { RemoveClosedDateForm } from './RemoveClosedDateForm'
import type { LooseOpeningHours } from '@/lib/schedule/schedule-view'
import { addClosedDateAction, removeClosedDateAction, updateHorariosAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'
import { artTodayStr } from '@/shared/dates/art'
import { EmptyState } from '@/components/ui/empty-state'

export default async function HorariosPage() {
  const { tenant } = await requireAdminStaff()

  const hours = tenant.openingHours as LooseOpeningHours
  const closedDates = (tenant.closedDates ?? []) as unknown as string[]
  const minDate = artTodayStr()

  return (
    <div className="space-y-6">
      {/* MASTER §6.8: la vista no abre encabezado propio — ver reservas/page.tsx. */}
      <SettingsTabs active="/settings/horarios" />

      <div className="card-premium space-y-6 rounded-lg p-6">
        <div>
          <h2 className="mb-6 text-base font-semibold text-foreground">Horarios de apertura</h2>
          <HorariosForm hours={hours} action={updateHorariosAction} />
        </div>

        <div className="space-y-3 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Días cerrados</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Bloqueá una fecha puntual (feriados, mantenimiento) sin tocar el horario semanal.
          </p>

          {closedDates.filter((d) => d >= minDate).length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {[...closedDates]
                .filter((d) => d >= minDate)
                .sort()
                .map((date) => (
                  <li
                    key={date}
                    className="flex items-center gap-2 rounded-full border border-border bg-muted/30 py-1 pr-1 pl-3 text-sm text-foreground"
                  >
                    <span>
                      {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <RemoveClosedDateForm
                      date={date}
                      action={removeClosedDateAction}
                      addAction={addClosedDateAction}
                    />
                  </li>
                ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarOff}
              title="No hay días cerrados"
              description="Agregá una fecha abajo para bloquear un día completo."
              className="py-6"
            />
          )}

          <AddClosedDateForm minDate={minDate} action={addClosedDateAction} />
        </div>
      </div>
    </div>
  )
}
