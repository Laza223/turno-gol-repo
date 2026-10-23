'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { BoardFields, type BoardPosition, type BoardSeeking } from '../../BoardFields'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type PublishAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>
type UnpublishAction = (matchId: string) => Promise<ActionResult>

const INITIAL: RivalFormResult = { success: true }
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const GHOST = 'h-11 w-full text-sm font-medium'

/**
 * Tablón del organizador (spec §5.3): publicado, dice dónde está y deja sacarlo; sin publicar, abre el
 * form en el lugar. Un partido publicado y uno sin publicar son dos ramas: la page vuelve a leer el
 * estado al terminar la action y el componente cambia de rama solo.
 */
export function PublishToBoard({
  matchId,
  boardLabel,
  whatsappPrefill,
  canSeekRival,
  publishAction,
  unpublishAction,
}: {
  matchId: string
  /** `null` = sin publicar; si no, el tipo con el que aparece ("Faltan 3", "Busca rival"…). */
  boardLabel: string | null
  whatsappPrefill: string | null
  /** "Buscamos rival" solo con cupo = formato y sin capitán rival confirmado (spec §3). */
  canSeekRival: boolean
  publishAction: PublishAction
  unpublishAction: UnpublishAction
}) {
  if (boardLabel !== null) {
    return <Published matchId={matchId} boardLabel={boardLabel} unpublishAction={unpublishAction} />
  }
  return (
    <Publish
      matchId={matchId}
      whatsappPrefill={whatsappPrefill}
      canSeekRival={canSeekRival}
      action={publishAction}
    />
  )
}

function Published({
  matchId,
  boardLabel,
  unpublishAction,
}: {
  matchId: string
  boardLabel: string
  unpublishAction: UnpublishAction
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function unpublish() {
    setError(null)
    setPending(true)
    startTransition(async () => {
      try {
        const res = await unpublishAction(matchId)
        if (!res.success) startTransition(() => setError(res.error))
      } catch (err) {
        unstable_rethrow(err)
        startTransition(() => setError('No pudimos conectar. Revisá tu conexión y probá de nuevo.'))
      } finally {
        startTransition(() => setPending(false))
      }
    })
  }

  return (
    <div className="space-y-1">
      <p className="text-base text-foreground">En el tablón: {boardLabel}</p>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={unpublish}
        className={GHOST}
      >
        Sacar del tablón
      </Button>
      {error && (
        <p role="alert" className={FIELD_ERROR}>
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
  action,
}: {
  matchId: string
  whatsappPrefill: string | null
  canSeekRival: boolean
  action: PublishAction
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const [seeking, setSeeking] = useState<BoardSeeking>('players')
  const [position, setPosition] = useState<BoardPosition>('any')
  const [whatsapp, setWhatsapp] = useState(whatsappPrefill ?? '')
  const [consent, setConsent] = useState(false)

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} className={GHOST}>
        Publicar en el tablón
      </Button>
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Publicar en el tablón"
      className="space-y-4 rounded-2xl border border-border bg-card p-4"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <BoardFields
        idPrefix="publicar"
        allowOff={false}
        allowRival={canSeekRival}
        seeking={seeking}
        onSeekingChange={setSeeking}
        position={position}
        onPositionChange={setPosition}
        whatsapp={whatsapp}
        onWhatsappChange={setWhatsapp}
        consent={consent}
        onConsentChange={setConsent}
        fieldError={(f) => (error?.field === f ? error.error : undefined)}
      />
      <div className="space-y-2">
        {/* Outline a propósito: el único verde de la vista es "Avisar al grupo". */}
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          className="h-11 w-full text-sm font-semibold"
        >
          {pending ? 'Publicando…' : 'Publicar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          className="h-11 w-full text-sm font-medium"
        >
          Ahora no
        </Button>
        {error && !error.field && (
          <p role="alert" className={FIELD_ERROR}>
            {error.error}
          </p>
        )}
      </div>
    </form>
  )
}
