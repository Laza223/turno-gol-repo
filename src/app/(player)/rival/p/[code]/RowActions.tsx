'use client'

import { startTransition, useState, useTransition } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { GlassConfirmSheet } from '@/components/world/GlassConfirmSheet'
import { cn } from '@/lib/utils'
import { RIVAL_OFFLINE_MESSAGE } from '@/modules/rival/rival-copy'
import type { ActionResult } from '@/shared/types/action-result'
import { RIVAL_GHOST } from '../../rival-classes'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type DecideAction = (participantId: string, decision: 'accept' | 'decline') => Promise<ActionResult>
type RemoveAction = (participantId: string) => Promise<ActionResult>

/** "Aceptar" y "Esta vez no" de un pedido. "Aceptar" no sale si no hay lugar (`canAccept`). */
export function RequestRowActions({
  participantId,
  canAccept,
  decideAction,
}: {
  participantId: string
  canAccept: boolean
  decideAction: DecideAction
}) {
  const [pending, run] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Cuál de los dos botones corre: los dos se apagan juntos, pero solo uno lo dice.
  const [running, setRunning] = useState<'accept' | 'decline' | null>(null)

  function decide(decision: 'accept' | 'decline') {
    setError(null)
    setRunning(decision)
    run(async () => {
      try {
        const res = await decideAction(participantId, decision)
        if (!res.success) startTransition(() => setError(res.error))
      } catch (err) {
        unstable_rethrow(err)
        startTransition(() => setError(RIVAL_OFFLINE_MESSAGE))
      } finally {
        startTransition(() => setRunning(null))
      }
    })
  }

  return (
    <>
      {canAccept && (
        <Button
          type="button"
          variant="pill-link"
          size="pill-sm"
          disabled={pending}
          aria-busy={running === 'accept'}
          onClick={() => decide('accept')}
          className={cn(RIVAL_GHOST, running === 'accept' && 'disabled:opacity-100')}
        >
          {running === 'accept' ? 'Aceptando…' : 'Aceptar'}
        </Button>
      )}
      <Button
        type="button"
        variant="pill-link"
        size="pill-sm"
        disabled={pending}
        aria-busy={running === 'decline'}
        onClick={() => decide('decline')}
        className={cn(RIVAL_GHOST, running === 'decline' && 'disabled:opacity-100')}
      >
        {running === 'decline' ? 'Un momento…' : 'Esta vez no'}
      </Button>
      {error && (
        <p role="alert" className="rv-err w-full">
          {error}
        </p>
      )}
    </>
  )
}

/** "Sacar" a un confirmado o del banco, con confirmación. */
export function RemoveRowAction({
  participantId,
  name,
  removeAction,
}: {
  participantId: string
  name: string
  removeAction: RemoveAction
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="pill-link"
        size="pill-sm"
        onClick={() => setOpen(true)}
        className={RIVAL_GHOST}
        aria-label={`Sacar a ${name}`}
      >
        Sacar
      </Button>
      <GlassConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={`¿Sacar a ${name}?`}
        description="Su lugar queda libre. Si hay banco, entra el primero."
        confirmLabel="Sí, sacar"
        cancelLabel="No, lo dejo"
        variant="destructive"
        onConfirm={() => removeAction(participantId)}
      />
    </>
  )
}
