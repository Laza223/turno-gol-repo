'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ActionResult } from '@/shared/types/action-result'
import type { ReferralRewardForReview } from '@/modules/referrals/referral-reward.service'
import type { ReferralRewardActionResult } from '../../actions'
import { TenantStatusBadge } from '../tenant-status-visual'
import { PulsoSection } from './pulso-section'

/**
 * Firma común de las tres Server Actions de `../../actions`. Entran por PROP,
 * no por import: el módulo es `'use server'` y rompería la story.
 */
type ReferralRewardAction = (
  referredTenantId: string,
  referrerTenantId: string | null,
) => Promise<ReferralRewardActionResult>

export type ReferralRewardActions = {
  approve: ReferralRewardAction
  markApplied: ReferralRewardAction
  reject: ReferralRewardAction
}

const rowLink = 'min-w-0 truncate font-medium text-foreground underline-offset-4 hover:underline'

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
})

type DialogKind = 'approve' | 'applied' | 'reject'

/**
 * "Premios de referidos" (R4): solo se dibuja si hay algo que mirar. Un premio
 * `earned` espera el OK; uno `manual_pending` espera que el founder devuelva
 * el próximo cobro en MercadoPago (método elegido el 2026-10-22).
 */
export function PulsoReferralRewards({
  rewards,
  actions,
}: {
  rewards: ReferralRewardForReview[]
  actions: ReferralRewardActions
}) {
  if (rewards.length === 0) return null

  return (
    <PulsoSection title="Premios de referidos">
      <ul className="divide-y divide-border">
        {rewards.map((reward) => (
          <RewardRow key={reward.referredTenantId} reward={reward} actions={actions} />
        ))}
      </ul>
    </PulsoSection>
  )
}

function RewardRow({
  reward,
  actions,
}: {
  reward: ReferralRewardForReview
  actions: ReferralRewardActions
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const pending = reward.status === 'manual_pending'
  const referrerName = reward.referrerName ?? 'un complejo que ya no existe'

  function run(action: ReferralRewardAction) {
    return async (): Promise<ActionResult | void> => {
      const res = await action(reward.referredTenantId, reward.referrerTenantId)
      if (!res.success) return { success: false, error: res.error }
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Gift className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {reward.referrerTenantId ? (
          <Link href={`/super-admin/tenants/${reward.referrerTenantId}`} className={rowLink}>
            {referrerName}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{referrerName}</span>
        )}
        {reward.referrerStatus ? <TenantStatusBadge status={reward.referrerStatus} /> : null}
        <span className="text-sm text-muted-foreground">
          {pending ? 'aprobado, falta devolverle un cobro' : 'ganó un mes'}
          {reward.statusAt ? ` · ${dateFormat.format(reward.statusAt)}` : ''}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Lo trajo a{' '}
        <Link href={`/super-admin/tenants/${reward.referredTenantId}`} className={rowLink}>
          {reward.referredName}
        </Link>
        , que ya pagó su primer mes.
      </p>
      {pending ? (
        <p className="text-sm text-foreground">
          Devolvé su próximo cobro desde el panel de MercadoPago de la cuenta master (si paga anual,
          1/12 del cobro) y avisale antes por WhatsApp.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {pending ? (
          <Button type="button" size="sm" onClick={() => setDialog('applied')}>
            Ya lo devolví
          </Button>
        ) : reward.referrerTenantId ? (
          <Button type="button" size="sm" onClick={() => setDialog('approve')}>
            Aprobar
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => setDialog('reject')}>
          Rechazar
        </Button>
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(open) => setDialog(open ? 'approve' : null)}
        title={`Aprobar el mes de "${referrerName}"`}
        consequences={
          reward.referrerStatus === 'trialing'
            ? [
                'Si todavía no cargó la tarjeta, su prueba se extiende 30 días sola.',
                'Si ya la cargó, queda para que devuelvas su próximo cobro en MercadoPago.',
              ]
            : ['Queda para que devuelvas su próximo cobro en MercadoPago.']
        }
        confirmLabel="Aprobar"
        cancelLabel="Cancelar"
        onConfirm={run(actions.approve)}
      />
      <ConfirmDialog
        open={dialog === 'applied'}
        onOpenChange={(open) => setDialog(open ? 'applied' : null)}
        title="¿Ya devolviste el cobro?"
        consequences={[`El mes de "${referrerName}" queda como acreditado.`]}
        confirmLabel="Sí, ya lo devolví"
        cancelLabel="Todavía no"
        onConfirm={run(actions.markApplied)}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(open) => setDialog(open ? 'reject' : null)}
        title={`Rechazar el mes de "${referrerName}"`}
        consequences={[
          'No se le aplica nada y no suma para su tope de 6.',
          'No se puede deshacer desde el panel.',
        ]}
        confirmLabel="Rechazar"
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={run(actions.reject)}
      />
    </li>
  )
}
