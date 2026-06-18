'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { TenantStatus } from '@/modules/billing/billing.types'
import { formatArs } from '@/lib/format'
import {
  cancelSubscriptionAction,
  changePlanAction,
  extendTrialAction,
  forceTenantStatusAction,
  reactivateTenantAction,
  resetStaffPasswordAction,
  updateTenantSettingsAction,
  type SupportActionResult,
} from '../actions'

const STATUS_LABELS: Record<TenantStatus, string> = {
  trialing: 'Trial',
  active: 'Activo',
  past_due: 'Pago vencido',
  suspended: 'Suspendido',
  blocked: 'Bloqueado',
  canceled: 'Cancelado',
  churned: 'Churned',
  deleted: 'Eliminado',
}

export type SupportPanelSettings = {
  requires_deposit: boolean
  deposit_percentage: number
  accepts_cash: boolean
  accepts_transfer: boolean
  accepts_mercadopago: boolean
  allow_online_booking: boolean
  booking_advance_days: number
  auto_complete_minutes: number
}

export type SupportPanelPlan = { id: string; name: string; priceMonthly: number }

type Props = {
  tenantId: string
  tenantName: string
  status: TenantStatus
  forceableTargets: TenantStatus[]
  destructiveTargets: TenantStatus[]
  canReactivate: boolean
  isTrialing: boolean
  hasSubscription: boolean
  currentPlanId: string | null
  plans: SupportPanelPlan[]
  settings: SupportPanelSettings
}

type Feedback = { kind: 'ok' | 'error'; text: string } | null

function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      role="status"
      className={`text-xs ${feedback.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}
    >
      {feedback.text}
    </p>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

const inputCls =
  'h-10 rounded-md border border-slate-200 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500'
const primaryBtn =
  'h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700 disabled:opacity-60'
const destructiveBtn =
  'h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 disabled:opacity-60'

/**
 * Tab "Acciones" del detalle de tenant. Cada sección llama su Server Action y
 * muestra el resultado inline. Las destructivas (blocked/deleted/cancelar)
 * exigen tipear el nombre exacto del tenant (patrón GitHub) — y la action lo
 * re-valida server-side.
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
  currentPlanId,
  plans,
  settings,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(
    fn: () => Promise<SupportActionResult>,
    setFeedback: (f: Feedback) => void,
  ): void {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        setFeedback({ kind: 'ok', text: res.message ?? 'Acción ejecutada.' })
        router.refresh()
      } else {
        setFeedback({ kind: 'error', text: res.error })
      }
    })
  }

  // ── Forzar estado ──
  const [forceTarget, setForceTarget] = useState<TenantStatus | ''>('')
  const [forceConfirm, setForceConfirm] = useState('')
  const [forceFeedback, setForceFeedback] = useState<Feedback>(null)
  const forceIsDestructive = forceTarget !== '' && destructiveTargets.includes(forceTarget)

  // ── Extender trial ──
  const [trialDays, setTrialDays] = useState(7)
  const [trialFeedback, setTrialFeedback] = useState<Feedback>(null)

  // ── Cambiar plan ──
  const [targetPlanId, setTargetPlanId] = useState('')
  const [planFeedback, setPlanFeedback] = useState<Feedback>(null)

  // ── Settings ──
  const [form, setForm] = useState<SupportPanelSettings>(settings)
  const [settingsFeedback, setSettingsFeedback] = useState<Feedback>(null)

  // ── Cancelar ──
  const [cancelReason, setCancelReason] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState('')
  const [cancelFeedback, setCancelFeedback] = useState<Feedback>(null)

  // ── Reactivar ──
  const [reactivateFeedback, setReactivateFeedback] = useState<Feedback>(null)

  // ── Reset de contraseña de staff ──
  const [resetEmail, setResetEmail] = useState('')
  const [resetFeedback, setResetFeedback] = useState<Feedback>(null)

  const boolFields: Array<{ key: keyof SupportPanelSettings; label: string }> = [
    { key: 'requires_deposit', label: 'Requiere seña' },
    { key: 'accepts_cash', label: 'Acepta efectivo' },
    { key: 'accepts_transfer', label: 'Acepta transferencia' },
    { key: 'accepts_mercadopago', label: 'Acepta MercadoPago' },
    { key: 'allow_online_booking', label: 'Permite reserva online' },
  ]

  return (
    <div className="space-y-4">
      <SectionCard
        title="Forzar transición de estado"
        description={`Estado actual: ${STATUS_LABELS[status]}. Solo se ofrecen destinos válidos según el ciclo de vida; las ventanas temporales del FSM (dunning/retención) se siguen respetando.`}
      >
        {forceableTargets.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay transiciones forzables desde el estado actual.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="force-target" className="text-sm font-medium text-slate-700">
                Estado destino
              </label>
              <select
                id="force-target"
                value={forceTarget}
                onChange={(e) => {
                  setForceTarget(e.target.value as TenantStatus | '')
                  setForceConfirm('')
                }}
                className={`${inputCls} bg-white`}
              >
                <option value="">Elegir…</option>
                {forceableTargets.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || forceTarget === '' || (forceIsDestructive && forceConfirm.trim() !== tenantName)}
                onClick={() =>
                  run(
                    () =>
                      forceTenantStatusAction({
                        tenantId,
                        targetStatus: forceTarget,
                        ...(forceIsDestructive ? { confirmName: forceConfirm } : {}),
                      }),
                    setForceFeedback,
                  )
                }
                className={forceIsDestructive ? destructiveBtn : primaryBtn}
              >
                Forzar estado
              </button>
            </div>
            {forceIsDestructive && (
              <div className="space-y-1 rounded-md bg-red-50 p-3 ring-1 ring-inset ring-red-600/20">
                <label htmlFor="force-confirm" className="block text-xs font-medium text-red-700">
                  Acción destructiva. Escribí el nombre exacto del complejo (<span className="font-semibold">{tenantName}</span>) para confirmar:
                </label>
                <input
                  id="force-confirm"
                  type="text"
                  value={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.value)}
                  className={`${inputCls} w-full`}
                  autoComplete="off"
                />
              </div>
            )}
            <FeedbackText feedback={forceFeedback} />
          </div>
        )}
      </SectionCard>

      {canReactivate && (
        <SectionCard
          title="Reactivar complejo"
          description="Vuelve el tenant a 'active' (transitionToActiveFromAny): limpia dunning, cancelación y fecha de eliminación programada."
        >
          <div className="space-y-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => reactivateTenantAction({ tenantId }), setReactivateFeedback)}
              className={primaryBtn}
            >
              Reactivar
            </button>
            <FeedbackText feedback={reactivateFeedback} />
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Extender trial"
        description="Mueve el fin de trial a max(hoy, fin actual) + días. Solo para tenants en trial."
      >
        {!isTrialing ? (
          <p className="text-sm text-slate-500">
            El complejo no está en trial — no aplica.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="trial-days" className="text-sm font-medium text-slate-700">
                Días (1–90)
              </label>
              <input
                id="trial-days"
                type="number"
                min={1}
                max={90}
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value))}
                className={`${inputCls} w-24 tabular-nums`}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => extendTrialAction({ tenantId, days: trialDays }), setTrialFeedback)
                }
                className={primaryBtn}
              >
                Extender trial
              </button>
            </div>
            <FeedbackText feedback={trialFeedback} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cambiar plan sin cobro"
        description="Swap inmediato del plan, sin cargo de proración. Si hay suscripción MP activa, actualiza el monto recurrente para el próximo ciclo."
      >
        {!hasSubscription ? (
          <p className="text-sm text-slate-500">
            El complejo no tiene suscripción registrada — no aplica.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="target-plan" className="text-sm font-medium text-slate-700">
                Plan destino
              </label>
              <select
                id="target-plan"
                value={targetPlanId}
                onChange={(e) => setTargetPlanId(e.target.value)}
                className={`${inputCls} bg-white`}
              >
                <option value="">Elegir…</option>
                {plans
                  .filter((p) => p.id !== currentPlanId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatArs(p.priceMonthly)}/mes
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={pending || targetPlanId === ''}
                onClick={() =>
                  run(() => changePlanAction({ tenantId, targetPlanId }), setPlanFeedback)
                }
                className={primaryBtn}
              >
                Cambiar plan
              </button>
            </div>
            <FeedbackText feedback={planFeedback} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Editar settings del complejo"
        description="Solo campos whitelisteados (los mismos que el admin edita en su panel). Nunca JSON libre."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {boolFields.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form[key] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="deposit-pct" className="text-xs font-medium text-slate-700">
                % de seña (0–100)
              </label>
              <input
                id="deposit-pct"
                type="number"
                min={0}
                max={100}
                value={form.deposit_percentage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deposit_percentage: Number(e.target.value) }))
                }
                className={`${inputCls} tabular-nums`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="advance-days" className="text-xs font-medium text-slate-700">
                Anticipación (días, 1–60)
              </label>
              <input
                id="advance-days"
                type="number"
                min={1}
                max={60}
                value={form.booking_advance_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, booking_advance_days: Number(e.target.value) }))
                }
                className={`${inputCls} tabular-nums`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="auto-complete" className="text-xs font-medium text-slate-700">
                Auto-completar (min, 0–1440)
              </label>
              <input
                id="auto-complete"
                type="number"
                min={0}
                max={1440}
                value={form.auto_complete_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, auto_complete_minutes: Number(e.target.value) }))
                }
                className={`${inputCls} tabular-nums`}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => updateTenantSettingsAction({ tenantId, patch: form }),
                setSettingsFeedback,
              )
            }
            className={primaryBtn}
          >
            Guardar settings
          </button>
          <FeedbackText feedback={settingsFeedback} />
        </div>
      </SectionCard>

      <SectionCard
        title="Resetear contraseña de staff"
        description="Genera una contraseña temporal para un miembro del complejo (soporte telefónico). El titular entra con la temporal y el sistema lo obliga a cambiarla. Solo staff activo de este complejo."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="reset-email" className="text-sm font-medium text-slate-700">
              Email del staff
            </label>
            <input
              id="reset-email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="staff@complejo.com"
              autoComplete="off"
              className={`${inputCls} w-64`}
            />
            <button
              type="button"
              disabled={pending || resetEmail.trim() === ''}
              onClick={() =>
                run(
                  () => resetStaffPasswordAction({ tenantId, email: resetEmail.trim() }),
                  setResetFeedback,
                )
              }
              className={primaryBtn}
            >
              Resetear contraseña
            </button>
          </div>
          <FeedbackText feedback={resetFeedback} />
        </div>
      </SectionCard>

      <SectionCard
        title="Cancelar suscripción"
        description="Cancela el preapproval de MercadoPago y pasa el tenant a 'canceled'. El acceso sigue hasta el fin del período pagado. Irreversible sin reactivación."
      >
        {!hasSubscription ? (
          <p className="text-sm text-slate-500">
            El complejo no tiene suscripción registrada — no aplica.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="cancel-reason" className="text-xs font-medium text-slate-700">
                Motivo (obligatorio)
              </label>
              <textarea
                id="cancel-reason"
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1 rounded-md bg-red-50 p-3 ring-1 ring-inset ring-red-600/20">
              <label htmlFor="cancel-confirm" className="block text-xs font-medium text-red-700">
                Acción destructiva. Escribí el nombre exacto del complejo (<span className="font-semibold">{tenantName}</span>) para confirmar:
              </label>
              <input
                id="cancel-confirm"
                type="text"
                value={cancelConfirm}
                onChange={(e) => setCancelConfirm(e.target.value)}
                className={`${inputCls} w-full`}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              disabled={
                pending || cancelReason.trim().length < 3 || cancelConfirm.trim() !== tenantName
              }
              onClick={() =>
                run(
                  () =>
                    cancelSubscriptionAction({
                      tenantId,
                      reason: cancelReason.trim(),
                      confirmName: cancelConfirm,
                    }),
                  setCancelFeedback,
                )
              }
              className={destructiveBtn}
            >
              Cancelar suscripción
            </button>
            <FeedbackText feedback={cancelFeedback} />
          </div>
        )}
      </SectionCard>
    </div>
  )
}
