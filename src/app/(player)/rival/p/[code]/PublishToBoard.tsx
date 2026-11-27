'use client'

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { FormError } from '../../FormError'
import { BoardFields, type BoardPosition, type BoardSeeking } from '../../BoardFields'
import { RIVAL_GHOST, RIVAL_SECONDARY } from '../../rival-classes'
import './partido.css'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type PublishAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
type UnpublishAction = (matchId: string) => Promise<ActionResult>

const INITIAL: RivalFormResult = { success: true }
/**
 * Tablón del organizador (spec §5.3): publicado, dice dónde está y deja sacarlo; sin publicar, abre el
 * form en el lugar. Un partido publicado y uno sin publicar son dos ramas: la page vuelve a leer el
 * estado al terminar la action y el componente cambia de rama solo.
 *
 * El verde de la vista es "Avisar al grupo"; con el form abierto, en cambio, "Publicar" es la acción primaria
 * (`onOpenChange` avisa para bajar "Avisar al grupo" a secundaria).
 */
export function PublishToBoard({
  matchId,
  boardLabel,
  whatsappPrefill,
  canSeekRival,
  onOpenChange,
  publishAction,
  unpublishAction,
}: {
  matchId: string
  /** `null` = sin publicar; si no, el tipo con el que aparece ("Faltan 3", "Busca rival"…). */
  boardLabel: string | null
  whatsappPrefill: string | null
  /** "Buscamos rival" solo con cupo = formato y sin capitán rival confirmado (spec §3). */
  canSeekRival: boolean
  /** Se llama al abrir y al cerrar el form de publicar. */
  onOpenChange?: (open: boolean) => void
  publishAction: PublishAction
  unpublishAction: UnpublishAction
}) {
  // ¿Este componente llegó a mostrar el form? Entonces "En el tablón" aparece por un envío y el foco
  // (que estaba en el form que se desmonta) tiene que ir ahí.
  const sawForm = useRef(false)
  useEffect(() => {
    if (boardLabel === null) sawForm.current = true
  }, [boardLabel])
  if (boardLabel !== null) {
    return (
      <Published
        matchId={matchId}
        boardLabel={boardLabel}
        sawForm={sawForm}
        unpublishAction={unpublishAction}
      />
    )
  }
  return (
    <Publish
      matchId={matchId}
      whatsappPrefill={whatsappPrefill}
      canSeekRival={canSeekRival}
      onOpenChange={onOpenChange}
      action={publishAction}
    />
  )
}

function Published({
  matchId,
  boardLabel,
  sawForm,
  unpublishAction,
}: {
  matchId: string
  boardLabel: string
  sawForm: { current: boolean }
  unpublishAction: UnpublishAction
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sawForm.current) rootRef.current?.focus()
  }, [sawForm])

  function unpublish() {
    setError(null)
    setPending(true)
    startTransition(async () => {
      try {
        const res = await unpublishAction(matchId)
        if (!res.success) startTransition(() => setError(res.error))
      } catch (err) {
        unstable_rethrow(err)
        startTransition(() => setError(RIVAL_OFFLINE_MESSAGE))
      } finally {
        startTransition(() => setPending(false))
      }
    })
  }

  return (
    <div ref={rootRef} tabIndex={-1} className="pa-note rp-place focus-visible:outline-hidden">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 size-5 shrink-0 text-portal-slot-ink" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="font-semibold text-portal-ink">Publicado en RIVAL: {boardLabel}</p>
          <p className="rv-small">Te avisamos por mail cuando alguien quiera sumarse.</p>
        </div>
      </div>
      <Button
        type="button"
        variant="pill-link"
        size="pill-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={unpublish}
        className={cn(RIVAL_GHOST, 'justify-self-start', pending && 'disabled:opacity-100')}
      >
        {pending ? 'Quitando…' : 'Dejar de publicar'}
      </Button>
      {error && (
        <p role="alert" className="rv-err">
          {error}
        </p>
      )}
    </div>
  )
}

function Publish({
  matchId,
  whatsappPrefill,
  canSeekRival,
  onOpenChange,
  action,
}: {
  matchId: string
  whatsappPrefill: string | null
  canSeekRival: boolean
  onOpenChange?: (open: boolean) => void
  action: PublishAction
}) {
  // Un corte de red no puede mandar al error boundary y perder lo tipeado. Publicar es idempotente
  // (reintentar es seguro); un redirect o un notFound viajan como excepción y pasan.
  const guarded = useCallback<PublishAction>(
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
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const wasOpen = useRef(false)

  // Al abrir, el foco va al título de la card (el botón se desmonta y el foco caería al body); al
  // cerrar con "Ahora no", vuelve al botón que la abrió.
  useEffect(() => {
    if (open) titleRef.current?.focus()
    else if (wasOpen.current) triggerRef.current?.focus()
    wasOpen.current = open
  }, [open])

  // Publicar con éxito desmonta el form sin pasar por "Ahora no": el padre tiene que enterarse igual.
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])
  useEffect(() => () => onOpenChangeRef.current?.(false), [])

  function toggle(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }
  const [state, formAction, pending] = useActionState(guarded, INITIAL)
  const [seeking, setSeeking] = useState<BoardSeeking>('players')
  const [position, setPosition] = useState<BoardPosition>('any')
  const [whatsapp, setWhatsapp] = useState(whatsappPrefill ?? '')
  const [consent, setConsent] = useState(false)
  const [savePhone, setSavePhone] = useState(false)

  if (!open) {
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant="pill-glass"
        size="pill"
        onClick={() => toggle(true)}
        className={RIVAL_SECONDARY}
      >
        Publicar en RIVAL
      </Button>
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  // Guardar solo tiene sentido con un número que la cuenta todavía no tiene.
  const typed = whatsapp.trim()
  const offerSave = typed !== '' && typed !== (whatsappPrefill ?? '').trim()
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="publicar-titulo"
      className="pa-note gap-5"
    >
      <h2
        id="publicar-titulo"
        ref={titleRef}
        tabIndex={-1}
        className="rv-h2 focus-visible:outline-hidden"
      >
        Publicar en RIVAL
      </h2>
      <input type="hidden" name="matchId" value={matchId} />
      <BoardFields
        idPrefix="publicar"
        allowRival={canSeekRival}
        seeking={seeking}
        onSeekingChange={setSeeking}
        position={position}
        onPositionChange={setPosition}
        whatsapp={whatsapp}
        onWhatsappChange={setWhatsapp}
        consent={consent}
        onConsentChange={setConsent}
        savePhone={offerSave ? { checked: savePhone, onChange: setSavePhone } : undefined}
        fieldError={(f) =>
          error?.fieldErrors?.[f] ?? (error?.field === f ? error.error : undefined)
        }
      />
      <div className="grid gap-2">
        {/* Con el form abierto, publicar es la acción primaria; "Avisar al grupo" baja a secundaria. */}
        <Button
          type="submit"
          variant="pill"
          size="pill"
          disabled={pending}
          aria-busy={pending}
          className="rv-go w-full"
        >
          {pending ? 'Publicando…' : 'Publicar'}
        </Button>
        <Button
          type="button"
          variant="pill-link"
          size="pill-sm"
          onClick={() => toggle(false)}
          className={cn(RIVAL_GHOST, 'w-full')}
        >
          Ahora no
        </Button>
        {error && !error.field && <FormError error={error.error} code={error.code} />}
      </div>
    </form>
  )
}
