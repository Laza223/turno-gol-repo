'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatArs } from '@/lib/format'
import { formatArtDate } from '@/shared/time/art-date'
import { PlusBadge } from '@/components/ui/plus-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PLUS_LIST_PER_COURT_CENTS } from '@/modules/billing/pricing'
import type { SetPlusInput, SupportActionResult } from '../actions'

export type SetTenantPlusAction = (
  tenantId: string,
  input: SetPlusInput,
) => Promise<SupportActionResult>

/**
 * Estado de Plus listo para el cliente. Es `PlusAdminState` (plus.service, que es
 * server-only) reducido a lo que la pantalla necesita y serializable: las fechas
 * viajan en ISO.
 */
export type PlusToggleState = {
  kind: 'off' | 'billed' | 'ending' | 'quote_pending' | 'manual_override' | 'no_subscription'
  /** Solo con `no_subscription`: el flag real del bot (puede estar prendido por un override). */
  botOn?: boolean
  /** Precio especial cargado, o null (= sigue a la lista). Centavos. */
  pricePerCourtCents: number | null
  /** Lo que se está aplicando por cancha (especial o lista). Centavos. */
  effectivePerCourtCents: number
  /** ISO. Fin de la baja agendada. */
  accessUntil: string | null
  quote: { months: number; amountCents: number } | null
}

type Props = {
  tenantId: string
  state: PlusToggleState
  action: SetTenantPlusAction
}

const inputCls =
  'h-11 w-32 rounded-md border border-border bg-background px-3 text-sm tabular-nums focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 md:h-9'
const primaryBtn =
  'h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 md:h-9'
const secondaryBtn =
  'h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 md:h-9'
const dangerBtn =
  'h-11 rounded-md border border-red-200 bg-card px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 md:h-9'

/** DD/MM en ART (el día ART, no el UTC). */
function formatDayMonth(iso: string): string {
  return formatArtDate(new Date(iso)).slice(0, 5)
}

/** Miles con punto, sin depender del ICU del runtime: 2000000 centavos -> "20.000". */
function pesosLabel(cents: number): string {
  return String(cents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Valor inicial del campo para un estado: vacío = lista. Solo un complejo
 * facturado con precio especial arranca con ese número (y se puede vaciar para
 * volver a la lista).
 */
function initialPesos(state: PlusToggleState): string {
  return state.kind === 'billed' && state.pricePerCourtCents !== null
    ? String(state.pricePerCourtCents / 100)
    : ''
}

function monthsLabel(n: number): string {
  return `${n} ${n === 1 ? 'mes' : 'meses'}`
}

/**
 * Plus (Asistente de WhatsApp) de un complejo: estado del cobro y las acciones
 * que le tocan a ese estado. El precio se tipea en pesos y viaja en centavos; vacío
 * viaja como `null` (= la lista, que se mueve con ella). El resto (monto del débito, cotización, flag del bot) lo resuelve el service.
 */
export function PlusToggle({ tenantId, state, action }: Props) {
  const router = useRouter()
  const priceId = useId()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const initial = initialPesos(state)
  const [pesos, setPesos] = useState(initial)
  // Cuando el estado cambia (después de `router.refresh()`) el campo toma el valor
  // del estado nuevo, no lo último que se tipeó.
  const [prevInitial, setPrevInitial] = useState(initial)
  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setPesos(initial)
  }

  function run(input: SetPlusInput) {
    if (isPending) return
    setError(null)
    setDone(null)
    startTransition(async () => {
      const res = await action(tenantId, input)
      // Después del await, los set* van en su propia transición (React 19).
      startTransition(() => {
        if (res.success) {
          setDone(res.message ?? 'Listo.')
          setPesos(initial)
          router.refresh()
        } else {
          setError(res.error)
        }
      })
    })
  }

  function enable(pricePerCourtCents: number | null) {
    run({ op: 'enable', pricePerCourtCents })
  }

  function enableWithTypedPrice() {
    // Vacío = lista. El error es solo para un 0 o un negativo escritos.
    if (pesos.trim() === '') {
      enable(null)
      return
    }
    const value = Number(pesos.replace(',', '.'))
    const cents = Math.round(value * 100)
    if (!Number.isFinite(value) || !Number.isInteger(cents) || cents <= 0) {
      setDone(null)
      setError('Ingresá un precio por cancha mayor a cero, o dejalo vacío para la lista.')
      return
    }
    enable(cents)
  }

  async function turnOffNow(): Promise<{ success: true } | { success: false; error: string }> {
    const res = await action(tenantId, { op: 'disable', mode: 'immediate' })
    if (!res.success) return res
    setError(null)
    setDone(res.message ?? 'Listo.')
    setPesos(initial)
    router.refresh()
    return { success: true }
  }

  const priceField = (buttonLabel: string) => (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={priceId} className="text-xs font-medium text-foreground">
          Precio por cancha
        </label>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-sm text-muted-foreground">
            $
          </span>
          <input
            id={priceId}
            type="number"
            inputMode="decimal"
            min={1}
            step="any"
            value={pesos}
            placeholder={`${pesosLabel(PLUS_LIST_PER_COURT_CENTS)} (lista)`}
            onChange={(e) => setPesos(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </div>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={enableWithTypedPrice}
        className={primaryBtn}
      >
        {isPending ? 'Guardando…' : buttonLabel}
      </button>
    </div>
  )

  const offForm = (
    <>
      {priceField('Prender Plus')}
      <p className="text-xs text-muted-foreground">
        Lista: {formatArs(PLUS_LIST_PER_COURT_CENTS)} por cancha por mes. Dejalo vacío para la
        lista; cargá un precio solo para un acuerdo especial.
      </p>
    </>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <PlusBadge />
        {state.kind === 'off' && (
          <span className="text-sm font-medium text-foreground">Apagado</span>
        )}
        {state.kind === 'billed' && (
          <span className="text-sm font-medium text-foreground">
            Facturado: {formatArs(state.effectivePerCourtCents)} por cancha{' '}
            {state.pricePerCourtCents === null ? '(lista)' : '(precio especial)'}
          </span>
        )}
        {state.kind === 'ending' && state.accessUntil && (
          <span className="text-sm font-medium text-foreground">
            Baja agendada: activo hasta el {formatDayMonth(state.accessUntil)}
          </span>
        )}
        {state.kind === 'quote_pending' && state.quote && (
          <span className="text-sm font-medium text-foreground">
            Esperando el pago de {monthsLabel(state.quote.months)}:{' '}
            {formatArs(state.quote.amountCents)}
          </span>
        )}
        {state.kind === 'manual_override' && (
          <span className="text-sm font-medium text-foreground">Prendido a mano (sin cobro)</span>
        )}
        {state.kind === 'no_subscription' && (
          <span className="text-sm font-medium text-foreground">
            Sin suscripción · bot {state.botOn ? 'prendido a mano (sin cobro)' : 'apagado'}
          </span>
        )}
      </div>

      {state.kind === 'no_subscription' && (
        <p className="text-xs text-muted-foreground">
          Plus va en el débito del plan: se puede prender cuando el complejo tenga suscripción.
        </p>
      )}

      {state.kind === 'off' && offForm}

      {state.kind === 'manual_override' && (
        <>
          <p className="text-xs text-muted-foreground">
            Hoy no se le cobra nada. Sigue andando hasta que lo prendas acá con un precio.
          </p>
          {offForm}
          <div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
              className={dangerBtn}
            >
              Apagar ya
            </button>
          </div>
        </>
      )}

      {state.kind === 'billed' && (
        <>
          {priceField('Actualizar precio')}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run({ op: 'disable', mode: 'end_of_period' })}
              className={secondaryBtn}
            >
              Dar de baja (fin de período)
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
              className={dangerBtn}
            >
              Apagar ya
            </button>
          </div>
        </>
      )}

      {state.kind === 'ending' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => enable(state.pricePerCourtCents)}
            className={primaryBtn}
          >
            Volver a prender
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
            className={dangerBtn}
          >
            Apagar ya
          </button>
        </div>
      )}

      {state.kind === 'quote_pending' && (
        <>
          <p className="text-xs text-muted-foreground">
            El dueño ve el botón para pagarlo en Facturación. Hasta que se acredite, el Asistente no
            se prende.
          </p>
          <div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
              className={dangerBtn}
            >
              Apagar ya
            </button>
          </div>
        </>
      )}

      {done && (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Apagar Plus ya?"
        description="El bot deja de contestar en el acto."
        consequences={[
          'El Asistente de WhatsApp deja de contestar ahora mismo.',
          'Si estaba en el débito, el monto baja.',
          'No se devuelve nada de forma automática.',
        ]}
        variant="destructive"
        confirmLabel="Apagar ya"
        cancelLabel="Volver"
        onConfirm={turnOffNow}
      />
    </div>
  )
}
