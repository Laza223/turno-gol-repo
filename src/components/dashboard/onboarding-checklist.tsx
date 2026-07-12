'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, ChevronDown, Circle, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildPublicLinkUrl, cn } from '@/lib/utils'
import type { ChecklistState } from '@/app/(admin)/dashboard/queries'
import type { MarkSharedResult } from '@/app/(admin)/dashboard/actions'

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
  { key: 'mpConnected',          label: 'MercadoPago conectado',              href: '/settings/facturacion' },
  { key: 'publicLinkShared',     label: 'Link público compartido',            action: 'copy-link' },
  { key: 'firstBookingReceived', label: 'Primera reserva online recibida' },
]

interface OnboardingChecklistProps {
  state: ChecklistState
  tenantSlug: string
  appUrl: string
  /**
   * Server Action que persiste el paso "link compartido". Llega por PROP
   * (nunca se importa como valor acá): `./actions` es `'use server'` y
   * arrastra drizzle/postgres + `node:async_hooks`, lo que rompe el bundle de
   * browser de Storybook. El type import sí es seguro (se borra en compilación).
   */
  action: () => Promise<MarkSharedResult>
}

/**
 * Checklist de setup compacta (pages/dashboard.md §4, Zeigarnik §9): los pasos
 * PENDIENTES quedan siempre visibles con su CTA; los completados se pliegan a
 * una fila-toggle para que el setup no entierre los KPIs del día.
 */
export function OnboardingChecklist({ state, tenantSlug, appUrl, action }: OnboardingChecklistProps) {
  const pendingItems = ITEMS.filter((i) => !state[i.key])
  const doneItems = ITEMS.filter((i) => state[i.key])
  const completed = doneItems.length
  const total = ITEMS.length
  const pct = Math.round((completed / total) * 100)
  const [minimized, setMinimized] = useState(completed === total)
  const [showDone, setShowDone] = useState(false)
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
        const res = await action()
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
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm shadow-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:shadow-none">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">¡Tu complejo está 100% listo!</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMinimized(false)}
          className="text-xs text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Ver checklist
        </Button>
      </div>
    )
  }

  function renderItem({ key, label, href, action }: ChecklistItem) {
    const done = state[key]
    return (
      <li key={key} className="flex items-center gap-3 py-2.5">
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
        )}
        <span
          className={cn(
            'flex-1 text-sm',
            done ? 'text-muted-foreground line-through' : 'text-foreground',
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
              className="h-11 md:h-8 text-xs"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {copied ? 'Copiado!' : 'Copiar link'}
            </Button>
            {shareError && (
              <p
                role="status"
                aria-live="polite"
                className="max-w-[12rem] text-right text-xs text-red-600 dark:text-red-400"
              >
                {shareError}
              </p>
            )}
          </div>
        )}

        {!done && href && (
          <a
            href={href}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
          >
            Configurar
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}

        {!done && key === 'firstBookingReceived' && state.publicLinkShared && (
          <p className="text-xs text-muted-foreground">Compartí tu link para recibir reservas.</p>
        )}
      </li>
    )
  }

  return (
    <div className="card-premium rounded-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Configuración del complejo</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{completed} de {total} completados</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
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

      {/* Pendientes: siempre visibles, cada uno con su acción (Zeigarnik). */}
      <ul className="divide-y divide-border px-5">
        {pendingItems.map(renderItem)}
      </ul>

      {/* Completados: plegados — lo hecho no ocupa lugar. */}
      {doneItems.length > 0 && (
        <div className="border-t border-border px-5">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center gap-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', showDone && 'rotate-180')}
              aria-hidden="true"
            />
            {doneItems.length} {doneItems.length === 1 ? 'paso completado' : 'pasos completados'}
          </button>
          {showDone && (
            <ul className="divide-y divide-border border-t border-border">
              {doneItems.map(renderItem)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
