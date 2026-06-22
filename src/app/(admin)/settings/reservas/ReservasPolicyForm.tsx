'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { updateReservasPolicyAction, type PolicyActionResult } from './actions'

const INITIAL_STATE: PolicyActionResult = { success: true }

/**
 * Form cliente de Políticas de Reserva (#21). Consume el PolicyActionResult vía
 * useFormState para mostrar error/éxito (antes el form plano descartaba el
 * resultado) y usa SubmitButton para el estado de carga.
 */
export function ReservasPolicyForm({ s }: { s: TenantSettings }) {
  const [state, formAction] = useFormState(updateReservasPolicyAction, INITIAL_STATE)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form
      action={formAction}
      onSubmit={() => setDidSubmit(true)}
      className="space-y-6 max-w-lg"
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">Seña</legend>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="radio"
              name="requiresDeposit"
              value="true"
              defaultChecked={s.requires_deposit !== false}
              className="accent-emerald-600"
            />
            Requerir seña
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="radio"
              name="requiresDeposit"
              value="false"
              defaultChecked={s.requires_deposit === false}
              className="accent-emerald-600"
            />
            Sin seña
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="depositPercentage">Porcentaje de seña (%)</Label>
          <Input
            id="depositPercentage"
            name="depositPercentage"
            type="number"
            inputMode="numeric"
            min={10}
            max={100}
            defaultValue={s.deposit_percentage ?? 30}
            className="h-10 w-32"
          />
          <p className="text-xs text-slate-500">Entre 10% y 100%</p>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label>Reservas online</Label>
        <p className="text-xs text-slate-500">
          Permite que los jugadores reserven solos desde la página pública de tu complejo. Si las
          deshabilitás, solo vos podés cargar reservas desde el panel.
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="radio"
              name="allowOnlineBooking"
              value="true"
              defaultChecked={s.allow_online_booking !== false}
              className="accent-emerald-600"
            />
            Habilitadas
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="radio"
              name="allowOnlineBooking"
              value="false"
              defaultChecked={s.allow_online_booking === false}
              className="accent-emerald-600"
            />
            Deshabilitadas
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cancellationHoursBefore">Anticipación mínima para cancelar (horas)</Label>
        <Input
          id="cancellationHoursBefore"
          name="cancellationHoursBefore"
          type="number"
          inputMode="numeric"
          min={0}
          max={72}
          defaultValue={s.cancellation_policy?.hours_before ?? 12}
          className="h-10 w-32"
        />
        <p className="text-xs text-slate-500">0 = sin límite de anticipación</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Ausencias (no-show)</legend>
        <p className="text-xs text-slate-500">
          Cuando marcás a un jugador como ausente, el sistema le genera una deuda
          por el valor del turno (menos la seña, si la pagó). Queda bloqueado para
          reservar online en tu complejo hasta que la salde. No requiere
          configuración.
        </p>
      </fieldset>

      <SubmitButton className="bg-emerald-600 hover:bg-emerald-500">Guardar cambios</SubmitButton>

      <div aria-live="polite" className="min-h-[1.25rem]">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700">
            Políticas guardadas.
          </p>
        )}
      </div>
    </form>
  )
}
