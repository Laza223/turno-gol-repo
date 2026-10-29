import { startTransition, useActionState, useMemo, useState, type FormEvent } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import type { RivalFormResult } from './actions'

/** Firma de las Server Actions (llegan por prop: importarlas como valor arrastra drizzle al bundle del browser). */
export type AlertAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

export type AlertSubscription = { tenantId: string; onlyGoalkeeper: boolean }

type LastAction = 'sub' | 'unsub' | null

// Estado inicial "sin respuesta todavía": ni éxito ni error, así no parpadea un "Listo" antes de que responda la action.
const IDLE: RivalFormResult = { success: false, error: '' }

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

function pickInitialTenantId(tenants: { id: string }[], defaultTenantId?: string): string {
  if (tenants.some((t) => t.id === defaultTenantId)) return defaultTenantId ?? ''
  return tenants.length === 1 ? tenants[0]!.id : ''
}

function successMessage(last: LastAction): string {
  return last === 'sub'
    ? 'Listo, te avisamos por mail. Un mail por día como mucho y podés darte de baja con un toque.'
    : 'Listo, no te vamos a avisar más de ese complejo.'
}

function pickResult(
  last: LastAction,
  subState: RivalFormResult,
  unsubState: RivalFormResult,
): RivalFormResult | null {
  if (last === null) return null
  return last === 'unsub' ? unsubState : subState
}

export function useAlertOptIn({
  tenants,
  subscribed,
  defaultTenantId,
  action,
  unsubscribeAction,
}: {
  tenants: { id: string; name: string }[]
  subscribed: AlertSubscription[]
  defaultTenantId?: string
  action: AlertAction
  unsubscribeAction: AlertAction
}) {
  const safeAction = useMemo(() => offlineSafe(action), [action])
  const safeUnsubscribe = useMemo(() => offlineSafe(unsubscribeAction), [unsubscribeAction])
  const [subState, subAction, subPending] = useActionState(safeAction, IDLE)
  const [unsubState, unsubAction, unsubPending] = useActionState(safeUnsubscribe, IDLE)
  // Controlados: React 19 resetea los campos no controlados al terminar una action.
  const initialTenantId = pickInitialTenantId(tenants, defaultTenantId)
  const [tenantId, setTenantId] = useState(initialTenantId)
  const [onlyGoalkeeper, setOnlyGoalkeeper] = useState(
    () => subscribed.find((a) => a.tenantId === initialTenantId)?.onlyGoalkeeper ?? false,
  )
  // Cuál de las dos acciones tocó el jugador por última vez (decide qué mensaje va).
  const [last, setLast] = useState<LastAction>(null)

  const pending = subPending || unsubPending
  const alreadyOn = tenantId !== '' && subscribed.some((a) => a.tenantId === tenantId)
  // Sin envío (o al cambiar de complejo) no hay mensaje: el resultado viejo era de otro complejo.
  const result = pickResult(last, subState, unsubState)
  const error = result && !result.success && result.error ? result : null
  const tenantError = error?.field === 'tenantId' ? error : null
  // El éxito se muestra solo cuando la action ya respondió con success (nunca mientras está pendiente).
  const okMessage = pending || !result?.success ? null : successMessage(last)

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

  return {
    tenantId,
    onlyGoalkeeper,
    setOnlyGoalkeeper,
    subPending,
    unsubPending,
    pending,
    alreadyOn,
    error,
    tenantError,
    okMessage,
    handleTenantChange,
    handleSubmit,
    handleUnsubscribe,
  }
}
