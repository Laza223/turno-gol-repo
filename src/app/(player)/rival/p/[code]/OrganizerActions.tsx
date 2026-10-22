'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PORTAL_BUTTON, PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'
import type { ActionResult } from '@/shared/types/action-result'

/** Firma de la Server Action (por prop, no por import: ver convenciones-stack). */
type CancelAction = (matchId: string) => Promise<ActionResult>

/**
 * Acciones del organizador: "Copiar link" (el único verde de la vista; cuando llegue "Avisar al
 * grupo" del PR3 pasa a ser el secundario) y "Cancelar el partido", con confirmación.
 */
export function OrganizerActions({
  matchId,
  shareUrl,
  cancelAction,
}: {
  matchId: string
  shareUrl: string
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
    <div className="space-y-3">
      <Button type="button" onClick={copy} className={cn(PORTAL_BUTTON, 'gap-2')}>
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setConfirmOpen(true)}
        className={PORTAL_BUTTON_OUTLINE}
      >
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
