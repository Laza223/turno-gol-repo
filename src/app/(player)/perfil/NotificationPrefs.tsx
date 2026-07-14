'use client'

import { useState, useTransition } from 'react'
import { BellRing, Mail } from 'lucide-react'
import type { UpdatePrefResult } from './actions'

type PrefKey = 'email' | 'push'

/** Firma de la Server Action que persiste el toggle. */
export type UpdateNotificationPrefAction = (
  pref: PrefKey,
  enabled: boolean,
) => Promise<UpdatePrefResult>

const PREF_DEFS: Array<{
  key: PrefKey
  label: string
  description: string
  Icon: typeof Mail
}> = [
  {
    key: 'email',
    label: 'Novedades por email',
    description:
      'Recibí novedades de tus reservas por email. Los emails de confirmación y cancelación se envían siempre.',
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
 *
 * La action llega por PROP, no por import: './actions' es `'use server'` y
 * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
 * que rompe cualquier bundle de browser (Storybook) si se importa como
 * valor. El type import de `UpdatePrefResult` sí es seguro: se borra en
 * compilación.
 */
export default function NotificationPrefs({
  initialEmail,
  initialPush,
  action,
}: {
  initialEmail: boolean
  initialPush: boolean
  action: UpdateNotificationPrefAction
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
      const result = await action(key, next)
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
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-emerald-400/40"
          >
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                on ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={label}
              onClick={() => toggle(key)}
              className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                on ? 'bg-primary' : 'bg-input'
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

      {/* text-red-600 sobre bg-background (#e2e7ee, el fondo real de /perfil) mide 3.88:1 — bajo AA. text-red-700 da 5.2:1. */}
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
