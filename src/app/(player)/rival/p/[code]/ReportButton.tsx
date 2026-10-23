'use client'

import { startTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { cn } from '@/lib/utils'
import { RIVAL_REPORT_REASON_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_REPORT_REASONS, type RivalReportReason } from '@/modules/rival/rival.schema'
import type { ActionResult } from '@/shared/types/action-result'

/** Firmas de las Server Actions (por prop, no por import: ver convenciones-stack). */
type ReportMatchAction = (matchId: string, reason: RivalReportReason) => Promise<ActionResult>
type ReportPlayerAction = (
  matchId: string,
  reportedPlayerId: string,
  reason: RivalReportReason,
) => Promise<ActionResult>

const THANKS = 'Gracias. Lo vamos a revisar.'

/** El botón fantasma + el diálogo de motivos. Una denuncia enviada deja el agradecimiento en su lugar. */
function ReportDialogButton({
  label,
  title,
  small = false,
  reasons = RIVAL_REPORT_REASONS,
  onReport,
}: {
  label: string
  title: string
  small?: boolean
  reasons?: readonly RivalReportReason[]
  onReport: (reason: RivalReportReason) => Promise<ActionResult>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <p role="status" className="py-2 text-sm text-muted-foreground">
        {THANKS}
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
        className={cn('h-11 font-medium', small ? 'px-3 text-[13px]' : 'w-full text-sm')}
      >
        {label}
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
    <ReportDialogButton
      label="Denunciar el partido"
      title="Denunciar el partido"
      onReport={(reason) => reportAction(matchId, reason)}
    />
  )
}

/** "Denunciar" a una persona dentro del partido. */
export function ReportPlayerButton({
  matchId,
  playerId,
  reportAction,
}: {
  matchId: string
  playerId: string
  reportAction: ReportPlayerAction
}) {
  return (
    <ReportDialogButton
      small
      // "El partido no existe" no aplica a una persona.
      reasons={RIVAL_REPORT_REASONS.filter((r) => r !== 'not_exists')}
      label="Denunciar"
      title="Denunciar a esta persona"
      onReport={(reason) => reportAction(matchId, playerId, reason)}
    />
  )
}
