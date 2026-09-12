'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Clock, Eye, HelpCircle, Wallet, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SubmitButton } from '@/components/ui/submit-button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatArs } from '@/lib/format'
import { addDays, artTodayStr } from '@/shared/dates/art'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import type { PolicyActionResult } from './actions'

/** Mismas clases que ya tenían los `<button>` sueltos (F-007, ver segmented-control.tsx). */
const pillClass = (active: boolean) =>
  `h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${
    active
      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs shadow-emerald-500/10'
      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
  }`
const chipClass = (active: boolean) =>
  `h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${
    active
      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
  }`

const INITIAL_STATE: PolicyActionResult = { success: true }

/** "YYYY-MM-DD" → "mié 17 de septiembre". Parseo a mediodía UTC (mismo idiom
 * que WeeklyAvailability.tsx) para no depender del huso horario del browser. */
const DOW_FORMATTER = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
function formatShortDate(dateStr: string): string {
  const dt = new Date(`${dateStr}T12:00:00Z`)
  return `${DOW_FORMATTER.format(dt)} ${DAY_MONTH_FORMATTER.format(dt)}`
}

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
  mpConnected = true,
  examplePriceCents = null,
}: {
  s: TenantSettings
  action: UpdateReservasPolicy
  /**
   * 🔴 F-003 (QA de producción 2026-08-17): sin MercadoPago conectado no hay con
   * qué cobrar la seña, así que el checkout público deja la reserva en
   * `pending_payment` hasta que expira sola. El control se bloquea acá y la
   * Server Action rechaza el mismo caso — la UI evita la trampa, la action es
   * la que garantiza que no se pueda guardar por POST directo.
   */
  mpConnected?: boolean
  /**
   * Precio "típico" (moda, en centavos) entre las canchas del tenant — solo
   * para el panel "Así lo ve el jugador". `null` si el complejo todavía no
   * cargó canchas/precios: el panel muestra un estado genérico, sin inventar
   * una cifra. Nunca se persiste ni viaja a la Server Action.
   */
  examplePriceCents?: number | null
}) {
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const [didSubmit, setDidSubmit] = useState(false)

  // Toggle states for boolean settings. Sin MP conectado la seña queda forzada
  // en "Sin seña", aunque el tenant tenga `requires_deposit=true` guardado de
  // antes (se pudo activar mientras el gate no existía).
  const [requiresDeposit, setRequiresDeposit] = useState(
    mpConnected ? s.requires_deposit !== false : false,
  )
  const [allowOnlineBooking, setAllowOnlineBooking] = useState(s.allow_online_booking !== false)

  // Deposit percentage states. Un tenant en "Sin seña" puede tener
  // deposit_percentage=0 guardado (fuera del rango válido 10-100): si no se
  // clampea acá, al activar "Requerir seña" por primera vez el input "Otro"
  // arranca precargado con "0", por debajo del min=10 del campo.
  const initialDeposit = s.deposit_percentage ?? 30
  const isPresetDeposit = [30, 50, 100].includes(initialDeposit)
  const isValidCustomDeposit = initialDeposit >= 10 && initialDeposit <= 100
  const [selectedPercentage, setSelectedPercentage] = useState<number | 'other'>(
    isPresetDeposit ? initialDeposit : isValidCustomDeposit ? 'other' : 30,
  )
  const [customPercentage, setCustomPercentage] = useState<string>(
    isPresetDeposit || !isValidCustomDeposit ? '30' : String(initialDeposit),
  )

  // Anticipación para reservar. Controlado (a diferencia del resto de los
  // inputs numéricos simples del repo) porque el panel lateral y la frase de
  // consecuencia de abajo necesitan el valor en vivo, mientras el admin lo
  // edita y ANTES de guardar.
  const [advanceDaysInput, setAdvanceDaysInput] = useState<string>(
    String(s.booking_advance_days ?? 6),
  )

  // Cancellation hours states
  const initialHours = s.cancellation_policy?.hours_before ?? 12
  const isPresetHours = [0, 2, 6, 12, 24].includes(initialHours)
  const [selectedHours, setSelectedHours] = useState<number | 'other'>(
    isPresetHours ? initialHours : 'other',
  )
  const [customHours, setCustomHours] = useState<string>(
    isPresetHours ? '12' : String(initialHours),
  )

  // Derivados en vivo, compartidos entre las frases de consecuencia inline y
  // el panel "Así lo ve el jugador" — todos leen el mismo estado de arriba.
  const advanceDaysNum = Number(advanceDaysInput)
  const validAdvanceDays =
    Number.isFinite(advanceDaysNum) && advanceDaysNum > 0 ? advanceDaysNum : null

  const cancelHoursNum = selectedHours === 'other' ? Number(customHours) : selectedHours
  const validCancelHours = Number.isFinite(cancelHoursNum) ? cancelHoursNum : null

  const depositPct = selectedPercentage === 'other' ? Number(customPercentage) : selectedPercentage
  const validDepositPct = Number.isFinite(depositPct) ? depositPct : null

  const depositCents =
    requiresDeposit && examplePriceCents != null && validDepositPct != null
      ? Math.round((examplePriceCents * validDepositPct) / 100)
      : null
  const restCents =
    examplePriceCents != null && depositCents != null ? examplePriceCents - depositCents : null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      {/* Panel "Así lo ve el jugador" (Cambio 2): arriba del form en mobile
          (order-first), columna sticky a la derecha en desktop. Es solo una
          vista previa — nada de acá se manda a la Server Action. */}
      <div className="order-first lg:sticky lg:top-6 lg:order-2 lg:col-span-1">
        <div className="reserva-receipt-card relative space-y-4 overflow-hidden rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Eye className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
            Así lo ve el jugador
          </h3>

          {examplePriceCents == null ? (
            <p className="text-xs text-muted-foreground">
              Cargá el precio de tus canchas en Configuración → Canchas para ver acá una vista
              previa con plata real.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Cancha 3 · sáb 13 · 21:00</p>
              <div className="space-y-1.5 border-t border-border pt-4 text-sm dark:border-white/10">
                <div className="flex justify-between text-muted-foreground">
                  <span>Precio del turno</span>
                  <span className="tabular-nums text-foreground">
                    {formatArs(examplePriceCents)}
                  </span>
                </div>
                {requiresDeposit && depositCents != null ? (
                  <>
                    <div className="flex items-baseline justify-between pt-0.5">
                      <span className="font-semibold text-foreground">Seña a pagar ahora</span>
                      <span className="font-display text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatArs(depositCents)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Resto en el complejo</span>
                      <span className="tabular-nums">{formatArs(restCents ?? 0)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sin seña: el jugador paga el total en el complejo.
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled
                className="w-full rounded-xl bg-primary/90 px-4 py-3 text-sm font-semibold text-primary-foreground opacity-90"
              >
                {requiresDeposit && depositCents != null
                  ? `Pagar seña de ${formatArs(depositCents)} y reservar`
                  : 'Pagar y reservar'}
              </button>
            </>
          )}

          <p className="border-t border-border pt-3 text-xs text-muted-foreground dark:border-white/10">
            {validCancelHours != null
              ? `Cancelación gratis hasta ${validCancelHours} h antes`
              : 'Cancelación según tu política'}
            {' · '}
            {validAdvanceDays != null
              ? `Podés reservar hasta ${validAdvanceDays} días adelante`
              : 'Anticipación según tu política'}
          </p>
        </div>
      </div>

      <form
        action={formAction}
        onSubmit={() => setDidSubmit(true)}
        className="space-y-8 lg:order-1 lg:col-span-2"
      >
        {/* RESERVAS ONLINE */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90">
            Reservas online
          </Label>
          <p className="text-xs text-muted-foreground max-w-md">
            Permite que los jugadores reserven solos desde la página pública de tu complejo. Si las
            deshabilitás, solo vos podés cargar reservas desde el panel.
          </p>
          <SegmentedControl
            className="flex gap-2"
            aria-label="Reservas online"
            value={allowOnlineBooking ? 'yes' : 'no'}
            onValueChange={(v) => setAllowOnlineBooking(v === 'yes')}
            itemClassName={pillClass}
            options={[
              { value: 'yes', label: 'Habilitadas' },
              { value: 'no', label: 'Deshabilitadas' },
            ]}
          />
          <input
            type="hidden"
            name="allowOnlineBooking"
            value={allowOnlineBooking ? 'true' : 'false'}
          />
        </div>

        {/* SEÑA */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90 mb-1">
            Seña
          </legend>
          <SegmentedControl
            className={`flex gap-2 ${mpConnected ? '' : 'opacity-50 cursor-not-allowed'}`}
            aria-label="Seña"
            value={requiresDeposit ? 'yes' : 'no'}
            onValueChange={(v) => setRequiresDeposit(v === 'yes')}
            itemClassName={pillClass}
            disabled={!mpConnected}
            options={[
              { value: 'yes', label: 'Requerir seña' },
              { value: 'no', label: 'Sin seña' },
            ]}
          />
          <input type="hidden" name="requiresDeposit" value={requiresDeposit ? 'true' : 'false'} />

          {!mpConnected && (
            <p className="text-xs text-muted-foreground max-w-md">
              Para cobrar seña necesitás conectar MercadoPago.{' '}
              <Link
                href="/settings/facturacion"
                className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
              >
                Conectar MercadoPago
              </Link>
              .
            </p>
          )}

          {requiresDeposit && (
            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <Label htmlFor="depositPercentage" className="text-sm font-medium text-foreground">
                Porcentaje de seña (%)
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  className="flex flex-wrap items-center gap-2"
                  // No repite el texto de <Label htmlFor="depositPercentage"> a
                  // propósito: un `aria-label` idéntico (o que lo contenga como
                  // substring) hace que `getByLabelText(/porcentaje de seña/i)`
                  // matchee DOS elementos — el radiogroup Y el input — y las
                  // stories con ese query ambiguan (`getMultipleElementsFoundError`).
                  aria-label="% de seña (presets)"
                  value={selectedPercentage === 'other' ? 'other' : String(selectedPercentage)}
                  onValueChange={(v) => {
                    if (v !== 'other') {
                      setSelectedPercentage(Number(v))
                      return
                    }
                    // MEJORA-UX QA: "Otro" pisaba el input con el `customPercentage`
                    // de INIT (30 fijo si arrancó en un preset) en vez del % activo
                    // — con seña real en 50%, mostraba "30" y guardar de largo
                    // bajaba la seña en silencio. Precarga con el preset activo.
                    if (typeof selectedPercentage === 'number') {
                      setCustomPercentage(String(selectedPercentage))
                    }
                    setSelectedPercentage('other')
                  }}
                  itemClassName={chipClass}
                  options={[
                    { value: '30', label: '30%' },
                    { value: '50', label: '50%' },
                    { value: '100', label: '100%' },
                    { value: 'other', label: 'Otro' },
                  ]}
                />

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
                      className="w-24 h-11 md:h-10 rounded-xl bg-background border-border"
                      required
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Entre 10% y 100%</p>
              {examplePriceCents != null && depositCents != null && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground max-w-md">
                  <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    En un turno de {formatArs(examplePriceCents)}, el jugador paga{' '}
                    {formatArs(depositCents)} ahora y el resto en el complejo.
                  </span>
                </p>
              )}
              <input
                type="hidden"
                name="depositPercentage"
                value={selectedPercentage === 'other' ? customPercentage : selectedPercentage}
              />
            </div>
          )}
        </fieldset>

        {/* ANTICIPACION MAXIMA PARA RESERVAR */}
        <div className="space-y-3">
          <Label
            htmlFor="bookingAdvanceDays"
            className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90"
          >
            Anticipación para reservar
          </Label>
          <p className="text-xs text-muted-foreground max-w-md">
            Cuántos días a futuro pueden ver y reservar los jugadores desde la página pública.
          </p>
          <div className="flex items-center gap-2">
            <Input
              id="bookingAdvanceDays"
              name="bookingAdvanceDays"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={advanceDaysInput}
              onChange={(e) => setAdvanceDaysInput(e.target.value)}
              className="w-24 h-11 md:h-10 rounded-xl bg-background border-border"
              required
            />
            <span className="text-sm text-muted-foreground">días</span>
          </div>
          <p className="text-xs text-muted-foreground">Entre 1 y 60 días</p>
          {validAdvanceDays != null && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground max-w-md">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                El jugador ve turnos hasta el{' '}
                {formatShortDate(addDays(artTodayStr(), validAdvanceDays))}. Vos podés cargar
                reservas más adelante desde la Grilla.
              </span>
            </p>
          )}
        </div>

        {/* ANTICIPACION MINIMA PARA CANCELAR */}
        <div className="space-y-3">
          <Label
            htmlFor="cancellationHoursBefore"
            className="text-sm font-semibold tracking-wide uppercase text-muted-foreground/90"
          >
            Anticipación mínima para cancelar
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              className="flex flex-wrap items-center gap-2"
              // Mismo motivo que el `aria-label` de "% de seña" de arriba: no
              // repetir el texto de la <Label> vecina (evita ambigüar un futuro
              // `getByLabelText` entre el radiogroup y el input de "Otro").
              aria-label="Anticipación para cancelar (presets)"
              value={selectedHours === 'other' ? 'other' : String(selectedHours)}
              onValueChange={(v) => {
                if (v !== 'other') {
                  setSelectedHours(Number(v))
                  return
                }
                // Misma clase que el "Otro" de seña, arriba.
                if (typeof selectedHours === 'number') setCustomHours(String(selectedHours))
                setSelectedHours('other')
              }}
              itemClassName={chipClass}
              options={[
                { value: '0', label: 'Sin límite' },
                { value: '2', label: '2 hs' },
                { value: '6', label: '6 hs' },
                { value: '12', label: '12 hs' },
                { value: '24', label: '24 hs' },
                { value: 'other', label: 'Otro' },
              ]}
            />

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
                  className="w-24 h-11 md:h-10 rounded-xl bg-background border-border"
                  required
                />
                <span className="text-sm text-muted-foreground">hs</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Horas previas al turno permitidas para cancelar
          </p>
          {validCancelHours != null && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground max-w-md">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {requiresDeposit
                  ? `Si cancela con más de ${validCancelHours} horas de anticipación, conserva la seña. Con menos, la seña queda para el complejo.`
                  : `Puede cancelar hasta ${validCancelHours} horas antes del turno. Como no hay seña, no hay nada que retener.`}
              </span>
            </p>
          )}
          <input
            type="hidden"
            name="cancellationHoursBefore"
            value={selectedHours === 'other' ? customHours : selectedHours}
          />
        </div>

        {/* AUSENCIAS — plegado por default (Cambio 3): el texto es el mismo de
            siempre, solo cambia de "siempre visible" a disclosure. */}
        <Collapsible>
          <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0">
            <span className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
              ¿Y si el jugador falta?
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground max-w-md">
              Cuando marcás a un jugador como ausente, si había pagado seña la perdés a favor del
              complejo. La primera ausencia solo queda registrada. Si vuelve a faltar dentro de los
              90 días, queda bloqueado para reservar online en tu complejo por 14 días. No requiere
              configuración.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <SubmitButton className="w-full sm:w-auto px-8 h-12 bg-primary hover:bg-emerald-500 text-base font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98] transition-all duration-200">
          Guardar cambios
        </SubmitButton>

        <div aria-live="polite" className="min-h-5">
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
    </div>
  )
}
