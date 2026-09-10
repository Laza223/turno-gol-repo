import { CalendarOff, Clock } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { PageHeader } from '@/components/admin/PageHeader'
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
      {/* H022: unificada al mismo PageHeader que ya usan perfil/avisos/canchas/equipo —
          el resto de Configuración resolvía la cabecera con un <h1> genérico "Configuración". */}
      <PageHeader
        title="Horarios"
        subtitle="Horario de apertura y días cerrados del complejo."
        icon={<Clock className="h-6 w-6" aria-hidden="true" />}
      />

      <SettingsTabs active="/settings/horarios" />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Horarios de apertura</h2>
        <HorariosForm
          hours={hours}
          closesNextDay={tenant.closesNextDay}
          action={updateHorariosAction}
        />
      </div>

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Días cerrados</h2>

        {closedDates.filter((d) => d >= minDate).length > 0 ? (
          <ul className="mb-4 space-y-2">
            {[...closedDates]
              .filter((d) => d >= minDate)
              .sort()
              .map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between rounded-md border border-border px-4 py-2"
                >
                  <span className="text-sm text-foreground">
                    {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
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
            description="Agregá una fecha abajo para bloquear un día completo (feriados, mantenimiento)."
            className="mb-4"
          />
        )}

        <AddClosedDateForm minDate={minDate} action={addClosedDateAction} />
      </div>
    </div>
  )
}
