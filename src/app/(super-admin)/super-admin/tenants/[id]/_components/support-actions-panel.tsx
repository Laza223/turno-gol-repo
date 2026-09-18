'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingCycle, TenantStatus } from '@/modules/billing/billing.types'
import { ForceStatusSection } from './support-actions/ForceStatusSection'
import { ReactivateSection } from './support-actions/ReactivateSection'
import { ExtendTrialSection } from './support-actions/ExtendTrialSection'
import { BilledCourtsSection } from './support-actions/BilledCourtsSection'
import { SettingsSection } from './support-actions/SettingsSection'
import { ResetPasswordSection } from './support-actions/ResetPasswordSection'
import { CancelSection } from './support-actions/CancelSection'
import type {
  BilledCourtsPricing,
  Feedback,
  RunAction,
  SupportActionsBag,
  SupportPanelSettings,
} from './support-actions/constants'

// Re-export para que la page importe los tipos desde el entry del panel.
export type { SupportActionsBag, SupportPanelSettings } from './support-actions/constants'

type Props = {
  tenantId: string
  tenantName: string
  status: TenantStatus
  forceableTargets: TenantStatus[]
  destructiveTargets: TenantStatus[]
  canReactivate: boolean
  isTrialing: boolean
  hasSubscription: boolean
  /** Canchas facturadas hoy. `null` = sin fila en tenant_subscriptions. */
  billedCourts: number | null
  billingCycle: BillingCycle | null
  /** Canchas con `status='online'`: piso de lo que se puede facturar. */
  onlineCourts: number
  pricing: BilledCourtsPricing | null
  settings: SupportPanelSettings
  actions: SupportActionsBag
}

/**
 * Tab "Acciones" del detalle de tenant. Cada sección llama su Server Action y
 * muestra el resultado inline. Las destructivas (blocked/deleted/cancelar)
 * exigen tipear el nombre exacto del tenant (patrón GitHub) — y la action lo
 * re-valida server-side. Un único `pending` compartido deshabilita todos los
 * botones mientras corre cualquier acción.
 */
export function SupportActionsPanel({
  tenantId,
  tenantName,
  status,
  forceableTargets,
  destructiveTargets,
  canReactivate,
  isTrialing,
  hasSubscription,
  billedCourts,
  billingCycle,
  onlineCourts,
  pricing,
  settings,
  actions,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run: RunAction = (fn, setFeedback: (f: Feedback) => void) => {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        setFeedback({ kind: 'ok', text: res.message ?? 'Acción ejecutada.' })
        router.refresh()
      } else {
        // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
        // render antes de que `pending` bajara, con los controles todavía deshabilitados.
        startTransition(() => setFeedback({ kind: 'error', text: res.error }))
      }
    })
  }

  return (
    <div className="space-y-4">
      <ForceStatusSection
        tenantId={tenantId}
        tenantName={tenantName}
        status={status}
        forceableTargets={forceableTargets}
        destructiveTargets={destructiveTargets}
        pending={pending}
        run={run}
        action={actions.forceStatus}
      />

      {canReactivate && (
        <ReactivateSection
          tenantId={tenantId}
          pending={pending}
          run={run}
          action={actions.reactivate}
        />
      )}

      <ExtendTrialSection
        tenantId={tenantId}
        isTrialing={isTrialing}
        pending={pending}
        run={run}
        action={actions.extendTrial}
      />

      <BilledCourtsSection
        tenantId={tenantId}
        currentBilledCourts={billedCourts}
        billingCycle={billingCycle}
        onlineCourts={onlineCourts}
        pricing={pricing}
        pending={pending}
        run={run}
        action={actions.changeBilledCourts}
      />

      <SettingsSection
        tenantId={tenantId}
        settings={settings}
        pending={pending}
        run={run}
        action={actions.updateSettings}
      />

      <ResetPasswordSection
        tenantId={tenantId}
        pending={pending}
        run={run}
        action={actions.resetPassword}
      />

      <CancelSection
        tenantId={tenantId}
        tenantName={tenantName}
        hasSubscription={hasSubscription}
        pending={pending}
        run={run}
        action={actions.cancelSubscription}
      />
    </div>
  )
}
