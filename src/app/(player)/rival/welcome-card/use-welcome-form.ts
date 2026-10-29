import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import { unstable_rethrow } from 'next/navigation'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import { useFieldErrors } from '../use-field-errors'
import {
  FIELD_IDS,
  FIELD_ORDER,
  INITIAL,
  type WelcomeAction,
  type WelcomeField,
  type WelcomeNeeds,
} from './welcome-copy'

/** Estado, envío, foco y errores por campo de la tarjeta de bienvenida. */
export function useWelcomeForm({
  action,
  needs,
  defaultName,
  defaultPosition,
  defaultZone,
  focusOnMount,
  heading,
}: {
  action: WelcomeAction
  needs: WelcomeNeeds
  defaultName: string
  defaultPosition?: string | null
  defaultZone?: string | null
  focusOnMount: boolean
  heading: RefObject<HTMLHeadingElement | null>
}) {
  // Un corte de red no puede mandar al error boundary y perder lo tipeado. Los dos momentos son
  // idempotentes (reintentar es seguro); un redirect o un notFound viajan como excepción y pasan.
  const guarded = useCallback<WelcomeAction>(
    async (prev, formData) => {
      try {
        return await action(prev, formData)
      } catch (err) {
        unstable_rethrow(err)
        return { success: false, error: RIVAL_OFFLINE_MESSAGE }
      }
    },
    [action],
  )
  const [state, formAction, pending] = useActionState(guarded, INITIAL)
  // Controlados: React 19 resetea los campos no controlados al terminar una action.
  const [name, setName] = useState(defaultName)
  const [position, setPosition] = useState<string>(defaultPosition ?? 'any')
  const [zone, setZone] = useState(defaultZone ?? '')

  useEffect(() => {
    if (!focusOnMount || !heading.current) return
    // Sin scroll propio del foco: la tarjeta queda con su título arriba, así nombre y zona entran
    // en la primera pantalla y la barra fija no los tapa.
    heading.current.focus({ preventScroll: true })
    heading.current.scrollIntoView({ block: 'start' })
  }, [focusOnMount, heading])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  const rendered = [
    ...(needs.identity ? (['firstName'] as const) : []),
    ...(needs.profile ? (['zone'] as const) : []),
  ]
  const reported: Partial<Record<WelcomeField, string>> = {}
  for (const f of rendered) {
    const message = error?.fieldErrors?.[f] ?? (error?.field === f ? error.error : undefined)
    if (message) reported[f] = message
  }
  // Solo lo que la tarjeta dibuja muestra su error; el primero es el único alert y recibe el foco.
  const fe = useFieldErrors<WelcomeField>({
    errors: reported,
    order: FIELD_ORDER,
    ids: FIELD_IDS,
    resetKey: state,
  })

  return {
    pending,
    name,
    setName,
    position,
    setPosition,
    zone,
    setZone,
    handleSubmit,
    error,
    hasFieldErrors: Object.keys(reported).length > 0,
    fe,
  }
}
