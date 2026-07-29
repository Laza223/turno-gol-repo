'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, ExternalLink, Globe, Lock } from 'lucide-react'
import type { TournamentStatus } from '@/modules/tournaments/tournament.types'
import type { TournamentActionResult } from '../actions'

export type SetVisibilityAction = (input: unknown) => Promise<TournamentActionResult>

/** El borrador nunca sale publicado, aunque el switch quede en sí. */
const PUBLISHABLE: TournamentStatus[] = ['registration', 'in_progress', 'finished']

export function PortalPanel({
  tournamentId,
  slug,
  tenantSlug,
  status,
  isPublic,
  canPublish,
  setVisibilityAction,
  openRegistrationAction,
}: {
  tournamentId: string
  slug: string
  tenantSlug: string
  status: TournamentStatus
  isPublic: boolean
  /** Publicar es configuración: el encargado ve el estado pero no lo cambia. */
  canPublish: boolean
  setVisibilityAction: SetVisibilityAction
  /** Mueve el torneo de borrador a inscripción abierta. Misma action que updateTournamentAction. */
  openRegistrationAction: SetVisibilityAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const publishable = PUBLISHABLE.includes(status)
  const live = isPublic && publishable
  const url = `/${tenantSlug}/torneos/${slug}`

  function toggle() {
    setError(null)
    startTransition(async () => {
      const result = await setVisibilityAction({ id: tournamentId, isPublic: !isPublic })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function openRegistration() {
    setError(null)
    startTransition(async () => {
      const result = await openRegistrationAction({ id: tournamentId, status: 'registration' })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
            {live ? (
              <Globe className="h-5 w-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
            Portal público
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {live
              ? 'Cualquiera puede ver la tabla, el fixture y los goleadores sin cuenta.'
              : 'El torneo no se ve desde afuera.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === 'draft' && canPublish && (
            <button
              type="button"
              onClick={openRegistration}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              Abrir inscripción
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            disabled={pending || !canPublish}
            aria-pressed={isPublic}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {isPublic ? 'Despublicar' : 'Publicar'}
          </button>
        </div>
      </div>

      {isPublic && !publishable && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          El torneo está marcado como público pero sigue en borrador: no se
          publica hasta que abras la inscripción.
        </p>
      )}

      {live && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {url}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )}

      {!canPublish && (
        <p className="text-xs text-muted-foreground">
          Publicar un torneo lo hace el dueño del complejo.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
    </section>
  )
}
