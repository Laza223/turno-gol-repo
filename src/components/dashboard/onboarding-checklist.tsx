'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildPublicLinkUrl, cn } from '@/lib/utils'
import type { ChecklistState } from '@/app/(admin)/dashboard/queries'
import { markPublicLinkSharedAction } from '@/app/(admin)/dashboard/actions'

interface ChecklistItem {
  key: keyof ChecklistState
  label: string
  href?: string
  action?: 'copy-link'
}

const ITEMS: ChecklistItem[] = [
  { key: 'accountCreated',       label: 'Cuenta creada' },
  { key: 'complexData',          label: 'Datos del complejo completados' },
  { key: 'hasCourts',            label: 'Al menos una cancha configurada',    href: '/canchas' },
  { key: 'hasSchedule',          label: 'Horarios definidos',                 href: '/settings/horarios' },
  { key: 'pinConfigured',        label: 'PIN de seguridad configurado',       href: '/settings/pin' },
  { key: 'mpConnected',          label: 'MercadoPago conectado',              href: '/settings/facturacion' },
  { key: 'publicLinkShared',     label: 'Link público compartido',            action: 'copy-link' },
  { key: 'firstBookingReceived', label: 'Primera reserva online recibida' },
]

interface OnboardingChecklistProps {
  state: ChecklistState
  tenantSlug: string
  appUrl: string
}

export function OnboardingChecklist({ state, tenantSlug, appUrl }: OnboardingChecklistProps) {
  const completed = ITEMS.filter((i) => state[i.key]).length
  const total = ITEMS.length
  const pct = Math.round((completed / total) * 100)
  const [minimized, setMinimized] = useState(completed === total)
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Persist the "link shared" checklist step. The action can fail silently
  // (e.g. rate limit) so we surface its result instead of assuming success.
  // A *thrown* action (network drop, redirect, transient server error) must NOT
  // bubble out of the transition: unhandled it crashed the checklist and bounced
  // the admin back to the start. Catch it and degrade to a soft notice — the
  // link was already copied regardless of whether the step persisted.
  function persistShared() {
    if (state.publicLinkShared) return
    startTransition(async () => {
      try {
        const res = await markPublicLinkSharedAction()
        setShareError(res.success ? null : res.error)
      } catch {
        setShareError('No pudimos guardar el paso, pero el link ya se copió.')
      }
    })
  }

  async function handleCopyLink() {
    // Resolve an absolute URL: prefer NEXT_PUBLIC_APP_URL, fall back to the
    // browser origin. If neither yields an absolute base, abort instead of
    // copying/sharing a useless relative link (and marking it as shared).
    const origin = typeof window !== 'undefined' ? window.location.origin : null
    const publicUrl = buildPublicLinkUrl(appUrl, origin, tenantSlug)
    if (!publicUrl) return
    setShareError(null)

    const canCopy = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
    if (canCopy) {
      try {
        await navigator.clipboard.writeText(publicUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        persistShared()
        return
      } catch {
        // fallthrough to prompt fallback
      }
    }
    // Fallback: prompt user to copy manually (Safari Private Mode, HTTP context, etc.)
    if (typeof window !== 'undefined') {
      window.prompt('Copiá el enlace público:', publicUrl)
      persistShared()
    }
  }

  if (minimized) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm shadow-emerald-100">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-900">¡Tu complejo está 100% listo!</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMinimized(false)}
          className="text-xs text-emerald-700 hover:text-emerald-900"
        >
          Ver checklist
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/50">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Progreso de configuración</h2>
          <p className="mt-0.5 text-xs text-slate-500">{completed} de {total} completados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-600">{pct}%</span>
          </div>
          {completed === total && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMinimized(true)}
              className="text-xs"
            >
              Minimizar
            </Button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-slate-50 px-6">
        {ITEMS.map(({ key, label, href, action }) => {
          const done = state[key]
          return (
            <li key={key} className="flex items-center gap-3 py-3">
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
              )}
              <span
                className={cn(
                  'flex-1 text-sm',
                  done ? 'text-slate-400 line-through' : 'text-slate-700',
                )}
              >
                {label}
              </span>

              {!done && action === 'copy-link' && (
                <div className="flex flex-col items-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    className="h-8 text-xs"
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {copied ? 'Copiado!' : 'Copiar link'}
                  </Button>
                  {shareError && (
                    <p
                      role="status"
                      aria-live="polite"
                      className="max-w-[12rem] text-right text-xs text-red-600"
                    >
                      {shareError}
                    </p>
                  )}
                </div>
              )}

              {!done && href && (
                <a
                  href={href}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                >
                  Configurar
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}

              {!done && key === 'firstBookingReceived' && state.publicLinkShared && (
                <p className="text-xs text-slate-500">Compartí tu link para recibir reservas.</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
