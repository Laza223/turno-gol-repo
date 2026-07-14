'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import type { PolicyActionResult } from './actions'

const INITIAL_STATE: PolicyActionResult = { success: true }

/** Firma de la Server Action que consume el form. */
export type UpdateReservasPolicy = (
  prevState: PolicyActionResult,
  formData: FormData,
) => Promise<PolicyActionResult>

/**
 * Form cliente de Políticas de Reserva (#21). Consume el PolicyActionResult vía
 * useActionState para mostrar error/éxito y usa SubmitButton para el estado de carga.
 * Utiliza selectores de chips premium para una experiencia fluida e interactiva.
 *
 * La action llega por PROP, no por import. El módulo './actions' es `'use server'`
 * y arrastra drizzle/postgres y `node:async_hooks` (vía request-context), así que
 * importarlo como valor lo mete en el grafo de cualquier bundle de browser
 * (Storybook) y lo rompe. El type import sí es seguro: se borra en compilación.
 */
export function ReservasPolicyForm({
  s,
  action,
}: {
  s: TenantSettings
  action: UpdateReservasPolicy
}) {
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const [didSubmit, setDidSubmit] = useState(false)

  // Toggle states for boolean settings
  const [requiresDeposit, setRequiresDeposit] = useState(s.requires_deposit !== false)
  const [allowOnlineBooking, setAllowOnlineBooking] = useState(s.allow_online_booking !== false)

  // Deposit percentage states
  const initialDeposit = s.deposit_percentage ?? 30
  const isPresetDeposit = [30, 50, 100].includes(initialDeposit)
  const [selectedPercentage, setSelectedPercentage] = useState<number | 'other'>(
    isPresetDeposit ? initialDeposit : 'other'
  )
  const [customPercentage, setCustomPercentage] = useState<string>(
    isPresetDeposit ? '30' : String(initialDeposit)
  )

  // Cancellation hours states
  const initialHours = s.cancellation_policy?.hours_before ?? 12
  const isPresetHours = [0, 2, 6, 12, 24].includes(initialHours)
  const [selectedHours, setSelectedHours] = useState<number | 'other'>(
    isPresetHours ? initialHours : 'other'
  )
  const [customHours, setCustomHours] = useState<string>(
    isPresetHours ? '12' : String(initialHours)
  )

  return (
    <form
      action={formAction}
      onSubmit={() => setDidSubmit(true)}
      className="space-y-8 max-w-lg"
    >
      {/* SEÑA */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90 mb-1">Seña</legend>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRequiresDeposit(true)}
            className={`h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${requiresDeposit
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-sm shadow-emerald-500/10'
                : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
          >
            Requerir seña
          </button>
          <button
            type="button"
            onClick={() => setRequiresDeposit(false)}
            className={`h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${!requiresDeposit
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-sm shadow-emerald-500/10'
                : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
          >
            Sin seña
          </button>
        </div>
        <input type="hidden" name="requiresDeposit" value={requiresDeposit ? 'true' : 'false'} />

        {requiresDeposit && (
          <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Label htmlFor="depositPercentage" className="text-sm font-medium text-foreground">
              Porcentaje de seña (%)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {[30, 50, 100].map((p) => {
                const active = selectedPercentage === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPercentage(p)}
                    className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${active
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                        : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    {p}%
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setSelectedPercentage('other')}
                className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${selectedPercentage === 'other'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
              >
                Otro
              </button>

              {selectedPercentage === 'other' && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                  <Input
                    id="depositPercentage"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={100}
                    value={customPercentage}
                    onChange={(e) => setCustomPercentage(e.target.value)}
                    placeholder="Ej: 40"
                    className="w-24 h-10 rounded-xl bg-background border-border"
                    required
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Entre 10% y 100%</p>
            <input
              type="hidden"
              name="depositPercentage"
              value={selectedPercentage === 'other' ? customPercentage : selectedPercentage}
            />
          </div>
        )}
      </fieldset>

      {/* RESERVAS ONLINE */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90">Reservas online</Label>
        <p className="text-xs text-muted-foreground max-w-md">
          Permite que los jugadores reserven solos desde la página pública de tu complejo. Si las
          deshabilitás, solo vos podés cargar reservas desde el panel.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAllowOnlineBooking(true)}
            className={`h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${allowOnlineBooking
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-sm shadow-emerald-500/10'
                : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
          >
            Habilitadas
          </button>
          <button
            type="button"
            onClick={() => setAllowOnlineBooking(false)}
            className={`h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${!allowOnlineBooking
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-sm shadow-emerald-500/10'
                : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
          >
            Deshabilitadas
          </button>
        </div>
        <input type="hidden" name="allowOnlineBooking" value={allowOnlineBooking ? 'true' : 'false'} />
      </div>

      {/* ANTICIPACION MINIMA PARA CANCELAR */}
      <div className="space-y-3">
        <Label htmlFor="cancellationHoursBefore" className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90">
          Anticipación mínima para cancelar
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: 0, label: 'Sin límite' },
            { value: 2, label: '2 hs' },
            { value: 6, label: '6 hs' },
            { value: 12, label: '12 hs' },
            { value: 24, label: '24 hs' },
          ].map((item) => {
            const active = selectedHours === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setSelectedHours(item.value)}
                className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${active
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
              >
                {item.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setSelectedHours('other')}
            className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${selectedHours === 'other'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
          >
            Otro
          </button>

          {selectedHours === 'other' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
              <Input
                id="cancellationHoursBefore"
                type="number"
                inputMode="numeric"
                min={0}
                max={72}
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                placeholder="Ej: 48"
                className="w-24 h-10 rounded-xl bg-background border-border"
                required
              />
              <span className="text-sm text-muted-foreground">hs</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Horas previas al turno permitidas para cancelar</p>
        <input
          type="hidden"
          name="cancellationHoursBefore"
          value={selectedHours === 'other' ? customHours : selectedHours}
        />
      </div>

      {/* AUSENCIAS */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90">Ausencias (no-show)</legend>
        <p className="text-xs text-muted-foreground max-w-md">
          Cuando marcás a un jugador como ausente, si había pagado seña la
          perdés a favor del complejo. La primera ausencia solo queda
          registrada. Si vuelve a faltar dentro de los 90 días, queda bloqueado
          para reservar online en tu complejo por 14 días. No requiere
          configuración.
        </p>
      </fieldset>

      <SubmitButton className="w-full sm:w-auto px-8 h-12 bg-primary hover:bg-emerald-500 text-base font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98] transition-all duration-200">
        Guardar cambios
      </SubmitButton>

      <div aria-live="polite" className="min-h-[1.25rem]">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Políticas guardadas.
          </p>
        )}
      </div>
    </form>
  )
}
