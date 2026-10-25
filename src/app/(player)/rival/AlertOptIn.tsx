'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'
import type { RivalFormResult } from './actions'

/** Firma de las Server Actions (llegan por prop: importarlas como valor arrastra drizzle al bundle del browser). */
type AlertAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

// Estado inicial "sin respuesta todavía": ni éxito ni error, así no parpadea un "Listo" antes de que responda la action.
const IDLE: RivalFormResult = { success: false, error: '' }
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'

/**
 * "Avisame cuando haya" del tablón vacío: un mail por día como mucho, con baja de un toque.
 * Acción secundaria (outline): el único verde de la vista es "Armar un partido". Si ya hay alerta
 * en el complejo, el mismo botón la actualiza (upsert) y aparece "Dejar de avisarme".
 */
export function AlertOptIn({
  tenants,
  signedIn,
  subscribed,
  action,
  unsubscribeAction,
}: {
  tenants: { id: string; name: string }[]
  signedIn: boolean
  /** Alertas que el jugador ya tiene (complejo y preferencia guardada). */
  subscribed: { tenantId: string; onlyGoalkeeper: boolean }[]
  action: AlertAction
  unsubscribeAction: AlertAction
}) {
  const [subState, subAction, subPending] = useActionState(action, IDLE)
  const [unsubState, unsubAction, unsubPending] = useActionState(unsubscribeAction, IDLE)
  // Controlados: React 19 resetea los campos no controlados al terminar una action.
  const [tenantId, setTenantId] = useState('')
  const [onlyGoalkeeper, setOnlyGoalkeeper] = useState(false)
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
  const result = last === 'unsub' ? unsubState : subState
  const error = !result.success && result.error ? result : null
  // El éxito se muestra solo cuando la action ya respondió con success (nunca mientras está pendiente).
  const okMessage =
    pending || !result.success
      ? null
      : last === 'sub'
        ? 'Listo, te avisamos por mail. Un mail por día como mucho y podés darte de baja con un toque.'
        : last === 'unsub'
          ? 'Listo, no te vamos a avisar más de ese complejo.'
          : null

  // Al elegir un complejo con alerta, la casilla toma lo guardado: "Actualizar" no pisa la preferencia en silencio.
  function handleTenantChange(id: string) {
    setTenantId(id)
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
        />
        {error?.field === 'tenantId' && (
          <p role="alert" className={FIELD_ERROR}>
            {error.error}
          </p>
        )}
        {alreadyOn && (
          <p role="status" className="text-[13px] leading-5 text-muted-foreground">
            Ya te avisamos de ese complejo. Podés cambiar la preferencia o dejar de recibirlas.
          </p>
        )}
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="onlyGoalkeeper"
          checked={onlyGoalkeeper}
          onChange={(e) => setOnlyGoalkeeper(e.target.checked)}
          className="size-6 shrink-0 cursor-pointer"
        />
        <span className="text-base text-foreground">Solo si buscan arquero</span>
      </label>

      <div className="space-y-2">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          className={`${PORTAL_BUTTON_OUTLINE} gap-2 rounded-full font-semibold`}
        >
          <BellRing className="size-4" aria-hidden />
          {subPending ? 'Guardando…' : alreadyOn ? 'Actualizar aviso' : 'Avisame cuando haya'}
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
      {error && error.field !== 'tenantId' && (
        <p role="alert" className={FIELD_ERROR}>
          {error.error}
        </p>
      )}
      {okMessage && (
        <p role="status" className="text-base text-foreground">
          {okMessage}
        </p>
      )}
    </form>
  )
}
