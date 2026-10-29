'use client'

import { startTransition, useActionState, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import type { RivalFormResult } from './actions'
import { FormError } from './FormError'
import { RivalCheckbox } from './RivalCheckbox'

/** Firma de las Server Actions (llegan por prop: importarlas como valor arrastra drizzle al bundle del browser). */
type AlertAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

// Estado inicial "sin respuesta todavía": ni éxito ni error, así no parpadea un "Listo" antes de que responda la action.
const IDLE: RivalFormResult = { success: false, error: '' }
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const TENANT_ERROR_ID = 'rival-alerta-complejo-error'

/**
 * Un corte de red no puede mandar al error boundary: guardar y darse de baja son idempotentes,
 * así que se dice y se reintenta. Un redirect o un notFound viajan como excepción y pasan.
 */
function offlineSafe(action: AlertAction): AlertAction {
  return async (prev, formData) => {
    try {
      return await action(prev, formData)
    } catch (err) {
      unstable_rethrow(err)
      return { success: false, error: RIVAL_OFFLINE_MESSAGE }
    }
  }
}

/**
 * "Avisame cuando haya" del tablón vacío (y del complejo filtrado sin partidos): un mail por día
 * como mucho, con baja de un toque.
 * Acción secundaria (outline): el único verde de la vista es "Armar un partido". Si ya hay alerta
 * en el complejo, el mismo botón la actualiza (upsert) y aparece "Dejar de avisarme".
 */
export function AlertOptIn({
  tenants,
  signedIn,
  subscribed,
  defaultTenantId,
  action,
  unsubscribeAction,
}: {
  tenants: { id: string; name: string }[]
  signedIn: boolean
  /** Alertas que el jugador ya tiene (complejo y preferencia guardada). */
  subscribed: { tenantId: string; onlyGoalkeeper: boolean }[]
  /** Complejo que ya eligió el jugador (el filtro del tablón): llega elegido. */
  defaultTenantId?: string
  action: AlertAction
  unsubscribeAction: AlertAction
}) {
  const safeAction = useMemo(() => offlineSafe(action), [action])
  const safeUnsubscribe = useMemo(() => offlineSafe(unsubscribeAction), [unsubscribeAction])
  const [subState, subAction, subPending] = useActionState(safeAction, IDLE)
  const [unsubState, unsubAction, unsubPending] = useActionState(safeUnsubscribe, IDLE)
  // Controlados: React 19 resetea los campos no controlados al terminar una action.
  const initialTenantId = tenants.some((t) => t.id === defaultTenantId)
    ? (defaultTenantId ?? '')
    : tenants.length === 1
      ? tenants[0]!.id
      : ''
  const [tenantId, setTenantId] = useState(initialTenantId)
  const [onlyGoalkeeper, setOnlyGoalkeeper] = useState(
    subscribed.find((a) => a.tenantId === initialTenantId)?.onlyGoalkeeper ?? false,
  )
  // Cuál de las dos acciones tocó el jugador por última vez (decide qué mensaje va).
  const [last, setLast] = useState<'sub' | 'unsub' | null>(null)

  if (!signedIn) {
    return (
      <p className="text-base text-muted-foreground">
        ¿Querés que te avisemos cuando haya partido?{' '}
        <Link
          href={`/ingresar?next=${encodeURIComponent('/rival')}`}
          className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
        >
          Ingresá y activá el aviso
        </Link>
        .
      </p>
    )
  }

  const pending = subPending || unsubPending
  const alreadyOn = tenantId !== '' && subscribed.some((a) => a.tenantId === tenantId)
  // Sin envío (o al cambiar de complejo) no hay mensaje: el resultado viejo era de otro complejo.
  const result = last === null ? null : last === 'unsub' ? unsubState : subState
  const error = result && !result.success && result.error ? result : null
  const tenantError = error?.field === 'tenantId' ? error : null
  // El éxito se muestra solo cuando la action ya respondió con success (nunca mientras está pendiente).
  const okMessage =
    pending || !result?.success
      ? null
      : last === 'sub'
        ? 'Listo, te avisamos por mail. Un mail por día como mucho y podés darte de baja con un toque.'
        : 'Listo, no te vamos a avisar más de ese complejo.'

  // Al elegir un complejo con alerta, la casilla toma lo guardado: "Actualizar" no pisa la preferencia en silencio.
  function handleTenantChange(id: string) {
    setTenantId(id)
    setLast(null)
    const saved = subscribed.find((a) => a.tenantId === id)
    if (saved) setOnlyGoalkeeper(saved.onlyGoalkeeper)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(() => {
      setLast('sub')
      subAction(data)
    })
  }

  function handleUnsubscribe() {
    const data = new FormData()
    data.set('tenantId', tenantId)
    startTransition(() => {
      setLast('unsub')
      unsubAction(data)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Avisame cuando haya partido"
      className="w-full space-y-4 text-left"
    >
      <div className="space-y-1.5">
        <Label htmlFor="rival-alerta-complejo" className="text-base">
          Avisame de partidos en
        </Label>
        <SelectMenu
          id="rival-alerta-complejo"
          name="tenantId"
          value={tenantId}
          onChange={handleTenantChange}
          options={tenants.map((t) => ({ value: t.id, label: t.name }))}
          placeholder="Elegí un complejo"
          className="rounded-lg bg-card md:text-base"
          aria-invalid={tenantError ? true : undefined}
          aria-describedby={tenantError ? TENANT_ERROR_ID : undefined}
        />
        {tenantError && (
          <p id={TENANT_ERROR_ID} role="alert" className={FIELD_ERROR}>
            {tenantError.error}
          </p>
        )}
        {alreadyOn && (
          <p role="status" className="text-[13px] leading-5 text-muted-foreground">
            Ya tenés el aviso activado en ese complejo. Podés cambiar la preferencia o desactivarlo.
          </p>
        )}
      </div>

      <RivalCheckbox name="onlyGoalkeeper" checked={onlyGoalkeeper} onChange={setOnlyGoalkeeper}>
        Solo si buscan arquero
      </RivalCheckbox>

      <div className="space-y-2">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          className={`${PORTAL_BUTTON_OUTLINE} gap-2 rounded-full font-semibold`}
        >
          <BellRing className="size-4" aria-hidden />
          {subPending ? 'Guardando…' : alreadyOn ? 'Actualizar aviso' : 'Avisarme por mail'}
        </Button>
        {alreadyOn && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={handleUnsubscribe}
            className={`${PORTAL_BUTTON_OUTLINE} rounded-full`}
          >
            {unsubPending ? 'Guardando…' : 'Dejar de avisarme'}
          </Button>
        )}
      </div>
      {error && !tenantError && <FormError error={error.error} code={error.code} />}
      {okMessage && (
        <p role="status" className="text-base text-foreground">
          {okMessage}
        </p>
      )}
    </form>
  )
}
