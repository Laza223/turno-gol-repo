'use client'

import { useState } from 'react'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import {
  inputCls,
  primaryBtn,
  type Feedback,
  type RunAction,
  type SupportAction,
  type SupportPanelSettings,
} from './constants'

type Props = {
  tenantId: string
  settings: SupportPanelSettings
  pending: boolean
  run: RunAction
  action: SupportAction
}

/** Editar settings del complejo: solo campos whitelisteados (los mismos que el admin edita). */
export function SettingsSection({ tenantId, settings, pending, run, action }: Props) {
  const [form, setForm] = useState<SupportPanelSettings>(settings)
  const [settingsFeedback, setSettingsFeedback] = useState<Feedback>(null)

  const boolFields: Array<{ key: keyof SupportPanelSettings; label: string }> = [
    { key: 'requires_deposit', label: 'Requiere seña' },
    { key: 'accepts_cash', label: 'Acepta efectivo' },
    { key: 'accepts_transfer', label: 'Acepta transferencia' },
    { key: 'accepts_mercadopago', label: 'Acepta MercadoPago' },
    { key: 'allow_online_booking', label: 'Permite reserva online' },
  ]

  return (
    <SectionCard
      title="Editar settings del complejo"
      description="Solo campos whitelisteados (los mismos que el admin edita en su panel). Nunca JSON libre."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {boolFields.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-border text-emerald-600 dark:text-emerald-400 focus:ring-emerald-500"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="deposit-pct" className="text-xs font-medium text-foreground">
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
            <label htmlFor="advance-days" className="text-xs font-medium text-foreground">
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
            <label htmlFor="auto-complete" className="text-xs font-medium text-foreground">
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
          onClick={() => run(() => action({ tenantId, patch: form }), setSettingsFeedback)}
          className={primaryBtn}
        >
          Guardar settings
        </button>
        <FeedbackText feedback={settingsFeedback} />
      </div>
    </SectionCard>
  )
}
