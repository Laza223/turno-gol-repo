'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { RIVAL_ACTION, RIVAL_GHOST, RIVAL_GHOST_DESTRUCTIVE } from '../../rival-classes'
import { PublishToBoard, RIVAL_SECONDARY } from './PublishToBoard'

/** Firma de la Server Action (por prop, no por import: ver convenciones-stack). */
type CancelAction = (matchId: string) => Promise<ActionResult>
type PublishAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

/**
 * Acciones del organizador. Un solo verde, siempre "Avisar al grupo" (spec §5.3; un `<a href>` que
 * arma el servidor con el texto del estado). Debajo, "Copiar link" como link de texto y el tablón
 * (publicar o sacar); "Cancelar el partido" queda fantasma en tono destructivo. `part` parte la
 * lista cuando el partido está recién armado: lo de arriba (`main`) y "Cancelar el partido" abajo
 * del plantel (`cancel`).
 */
export function OrganizerActions({
  matchId,
  shareUrl,
  shareHref,
  boardLabel,
  whatsappPrefill,
  canSeekRival,
  part = 'all',
  cancelAction,
  publishAction,
  unpublishAction,
}: {
  matchId: string
  shareUrl: string
  /** `wa.me/?text=…` armado en el servidor (`buildShareHref`). */
  shareHref: string
  /** Con qué tipo está en el tablón ("Faltan 3"…); `null` = solo el grupo. */
  boardLabel: string | null
  whatsappPrefill: string | null
  /** Ver `PublishToBoard`. */
  canSeekRival: boolean
  part?: 'all' | 'main' | 'cancel'
  cancelAction: CancelAction
  publishAction: PublishAction
  unpublishAction: CancelAction
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyFailed(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Sin permiso de portapapeles: el link queda a la vista para copiarlo a mano.
      setCopyFailed(true)
    }
  }

  const share = (
    <a
      href={shareHref}
      target="_blank"
      rel="noopener noreferrer"
      className={
        !publishOpen
          ? RIVAL_ACTION
          : cn(buttonVariants({ variant: 'outline' }), RIVAL_GHOST, RIVAL_SECONDARY, 'w-full gap-2')
      }
    >
      <Share2 className="size-4 shrink-0" aria-hidden /> Avisar al grupo
    </a>
  )
  const board = (
    <PublishToBoard
      matchId={matchId}
      boardLabel={boardLabel}
      whatsappPrefill={whatsappPrefill}
      canSeekRival={canSeekRival}
      onOpenChange={setPublishOpen}
      publishAction={publishAction}
      unpublishAction={unpublishAction}
    />
  )

  const showMain = part !== 'cancel'
  const showCancel = part !== 'main'

  return (
    <div className="space-y-4">
      {showMain && (
        <>
          {share}
          <Button
            type="button"
            variant="ghost"
            onClick={copy}
            className="min-h-11 w-full gap-2 text-sm text-muted-foreground underline underline-offset-4 focus-visible:ring-offset-background"
          >
            {copied ? (
              <>
                <Check className="size-4 shrink-0" aria-hidden /> Link copiado
              </>
            ) : (
              <>
                <Copy className="size-4 shrink-0" aria-hidden /> Copiar link
              </>
            )}
          </Button>
          <p role="status" className="sr-only">
            {copied ? 'Link copiado' : ''}
          </p>
          {copyFailed && (
            <p className="break-all rounded-xl bg-muted/50 p-3 text-sm text-foreground">
              No pudimos copiarlo solo. Copialo desde acá: {shareUrl}
            </p>
          )}
          {board}
        </>
      )}
      {showCancel && (
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            className={cn(RIVAL_GHOST_DESTRUCTIVE, 'w-full')}
          >
            Cancelar el partido
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="¿Cancelar el partido?"
            description="El link va a mostrar que el partido se cayó y nadie más se va a poder sumar. A quienes ya se sumaron les avisamos por mail."
            confirmLabel="Sí, cancelar"
            cancelLabel="No, lo dejo"
            variant="destructive"
            onConfirm={() => cancelAction(matchId)}
          />
        </>
      )}
    </div>
  )
}
