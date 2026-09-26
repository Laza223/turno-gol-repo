import { CalendarOff } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { AddClosedDateForm } from './AddClosedDateForm'
import { HorariosForm } from './HorariosForm'
import { RemoveClosedDateForm } from './RemoveClosedDateForm'
import type { LooseOpeningHours } from '@/lib/schedule/schedule-view'
import { addClosedDateAction, removeClosedDateAction, updateHorariosAction } from './actions'
import { SettingsHeader } from '../SettingsHeader'
import { artTodayStr } from '@/shared/dates/art'
import { EmptyState } from '@/components/ui/empty-state'

export default async function HorariosPage() {
  const { tenant } = await requireAdminStaff()

  const hours = tenant.openingHours as LooseOpeningHours
  const closedDates = (tenant.closedDates ?? []) as unknown as string[]
  const minDate = artTodayStr()

  return (
    <div className="space-y-6">
      <SettingsHeader title="Horarios" />

      {/* `min-[1440px]` y no `lg`: los días de "Días con otro horario" van en dos columnas
          por viewport (`md:grid-cols-2` en ScheduleFields), y a media card quedan
          de ~190px en 1024px (con la card a 3fr/2fr, desde 1440px son ~360px) — no entra "Miércoles + 10:00 a 23:00 + Personalizar". */}
      <div className="card-premium grid grid-cols-1 gap-6 rounded-lg p-6 min-[1440px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <h2 className="text-base font-semibold text-foreground">Horario de la semana</h2>
          <p className="mt-0.5 mb-6 text-sm text-muted-foreground">
            Lo que ve el jugador y las horas que muestra la Grilla.
          </p>
          <HorariosForm hours={hours} action={updateHorariosAction} />
        </div>

        <div className="space-y-3 border-t border-border pt-6 min-[1440px]:border-t-0 min-[1440px]:border-l min-[1440px]:pt-0 min-[1440px]:pl-6">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Días cerrados</h2>
          </div>
          {/* Un día cerrado solo saca los turnos de la reserva por internet: no
              cancela lo cargado y la carga manual sigue abierta
              (booking.service.ts, `closedDates` → `closedDay`). */}
          <p className="text-xs text-muted-foreground">
            Un feriado o un arreglo: ese día nadie reserva por internet. Los turnos ya cargados no
            se cancelan.
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
