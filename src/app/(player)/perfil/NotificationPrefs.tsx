'use client'

import { useState, useTransition } from 'react'
import { BellRing, Mail } from 'lucide-react'
import { updateNotificationPrefAction } from './actions'

type PrefKey = 'email' | 'push'

const PREF_DEFS: Array<{
  key: PrefKey
  label: string
  description: string
  Icon: typeof Mail
}> = [
  {
    key: 'email',
    label: 'Recordatorios por email',
    description:
      'Te avisamos 24 h antes de cada partido. Los emails de confirmación y cancelación se envían siempre.',
    Icon: Mail,
  },
  {
    key: 'push',
    label: 'Notificaciones push',
    description: 'Avisos en este dispositivo cuando haya novedades de tus reservas.',
    Icon: BellRing,
  },
]

/**
 * Toggles de notificación del jugador. Optimistas: el switch cambia al toque,
 * la Server Action persiste en players.notify_email/notify_push y ante error
 * se revierte con mensaje. Switch nativo accesible (role="switch").
 */
export default function NotificationPrefs({
  initialEmail,
  initialPush,
}: {
  initialEmail: boolean
  initialPush: boolean
}) {
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    email: initialEmail,
    push: initialPush,
  })
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggle(key: PrefKey) {
    const next = !prefs[key]
    setPrefs((p) => ({ ...p, [key]: next }))
    setError(null)
    startTransition(async () => {
      const result = await updateNotificationPrefAction(key, next)
      if (!result.success) {
        setPrefs((p) => ({ ...p, [key]: !next }))
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      {PREF_DEFS.map(({ key, label, description, Icon }) => {
        const on = prefs[key]
        return (
          <div
            key={key}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                on ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={label}
              onClick={() => toggle(key)}
              className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                on ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  on ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )
      })}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
