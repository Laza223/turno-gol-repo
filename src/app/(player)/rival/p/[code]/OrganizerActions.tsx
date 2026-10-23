'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/shared/types/action-result'

/** Firma de la Server Action (por prop, no por import: ver convenciones-stack). */
type CancelAction = (matchId: string) => Promise<ActionResult>

/** Quiet Ghost Rule (DESIGN.md): sin borde ni relleno, 44 px, 14 px medium. */
const GHOST = 'h-11 w-full text-sm font-medium'

/**
 * Acciones del organizador. El único verde es "Avisar al grupo" (spec §5.3): un `<a href>` que
 * arma el servidor con el texto del estado. "Copiar link" y "Cancelar el partido" son fantasma.
 */
export function OrganizerActions({
  matchId,
  shareUrl,
  shareHref,
  cancelAction,
}: {
  matchId: string
  shareUrl: string
  /** `wa.me/?text=…` armado en el servidor (`buildShareHref`). */
  shareHref: string
  cancelAction: CancelAction
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

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

  return (
    <div className="space-y-2">
      <a
        href={shareHref}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants(), PORTAL_BUTTON, 'gap-2')}
      >
        <Share2 className="size-4 shrink-0" aria-hidden /> Avisar al grupo
      </a>
      <Button type="button" variant="ghost" onClick={copy} className={cn(GHOST, 'gap-2')}>
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
      <Button type="button" variant="ghost" onClick={() => setConfirmOpen(true)} className={GHOST}>
        Cancelar el partido
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Cancelar el partido?"
        description="El link va a mostrar que el partido se cayó y nadie más se va a poder sumar."
        confirmLabel="Sí, cancelar el partido"
        cancelLabel="No, lo dejo"
        variant="destructive"
        onConfirm={() => cancelAction(matchId)}
      />
    </div>
  )
}
