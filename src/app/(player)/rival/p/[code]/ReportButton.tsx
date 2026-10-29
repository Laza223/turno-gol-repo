'use client'

import { startTransition, useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { cn } from '@/lib/utils'
import { RIVAL_REPORT_REASON_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_REPORT_REASONS, type RivalReportReason } from '@/modules/rival/rival.schema'
import type { ActionResult } from '@/shared/types/action-result'
import { RIVAL_GHOST_QUIET } from '../../MatchBits'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type ReportMatchAction = (matchId: string, reason: RivalReportReason) => Promise<ActionResult>
type ReportPlayerAction = (
  matchId: string,
  reportedPlayerId: string,
  reason: RivalReportReason,
) => Promise<ActionResult>

const THANKS = 'Gracias. Lo vamos a revisar.'

/**
 * El botón fantasma + el diálogo de motivos. Una denuncia enviada deja el agradecimiento en su lugar.
 * `iconOnly` (la denuncia a una persona) es una bandera con "Denunciar" de 44 px de alto que va en la
 * línea del nombre; ya enviada queda un "Gracias." corto para que la fila no cambie de ancho.
 */
function ReportDialogButton({
  label,
  title,
  iconOnly = false,
  reasons = RIVAL_REPORT_REASONS,
  onReport,
}: {
  label: string
  title: string
  iconOnly?: boolean
  reasons?: readonly RivalReportReason[]
  onReport: (reason: RivalReportReason) => Promise<ActionResult>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <p role="status" className={cn('py-2 text-sm text-muted-foreground', iconOnly && 'shrink-0')}>
        {iconOnly ? (
          <>
            Gracias.<span className="sr-only"> Lo vamos a revisar.</span>
          </>
        ) : (
          THANKS
        )}
      </p>
    )
  }

  async function confirm(): Promise<ActionResult> {
    const picked = reasons.find((r) => r === reason)
    if (!picked) return { success: false, error: 'Elegí el motivo.' }
    const res = await onReport(picked)
    if (res.success) startTransition(() => setSent(true))
    return res
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? label : undefined}
        className={cn(
          RIVAL_GHOST_QUIET,
          iconOnly ? '-my-2 shrink-0 gap-1 self-center px-3' : 'w-full',
        )}
      >
        {iconOnly ? (
          <>
            <Flag className="size-4" aria-hidden />
            Denunciar
          </>
        ) : (
          label
        )}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setReason('')
        }}
        title={title}
        description="Elegí el motivo. Lo revisamos nosotros; a quien denuncies no le avisamos."
        confirmLabel="Enviar denuncia"
        cancelLabel="Mejor no"
        onConfirm={confirm}
      >
        <RadioChipGroup aria-label="Motivo" value={reason} onValueChange={setReason}>
          {reasons.map((r) => (
            <RadioChip key={r} value={r}>
              {RIVAL_REPORT_REASON_LABELS[r]}
            </RadioChip>
          ))}
        </RadioChipGroup>
      </ConfirmDialog>
    </>
  )
}

/** "Denunciar el partido": quien tiene sesión y no lo organiza. */
export function ReportMatchButton({
  matchId,
  reportAction,
}: {
  matchId: string
  reportAction: ReportMatchAction
}) {
  return (
    // Aparte de las acciones propias: una línea y aire, para que nadie la toque buscando "Me bajo".
    <div className="border-t border-border pt-4">
      <ReportDialogButton
        label="Denunciar el partido"
        title="Denunciar el partido"
        onReport={(reason) => reportAction(matchId, reason)}
      />
    </div>
  )
}

/** "Denunciar a {name}": un ícono en la fila de la persona, con su nombre en el nombre accesible. */
export function ReportPlayerButton({
  matchId,
  playerId,
  name,
  reportAction,
}: {
  matchId: string
  playerId: string
  name: string
  reportAction: ReportPlayerAction
}) {
  return (
    <ReportDialogButton
      iconOnly
      // "El partido no existe" no aplica a una persona.
      reasons={RIVAL_REPORT_REASONS.filter((r) => r !== 'not_exists')}
      label={`Denunciar a ${name}`}
      title="Denunciar a esta persona"
      onReport={(reason) => reportAction(matchId, playerId, reason)}
    />
  )
}
