'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, Plus, Users, X } from 'lucide-react'
import type { TournamentTeamRow } from '@/modules/tournaments/tournament.types'
import type { TournamentActionResult } from '../actions'
import { TEAM_STATUS_LABELS, teamStatusBadgeClass } from '../torneos-lib'

export type AddTeamAction = (input: unknown) => Promise<TournamentActionResult>
export type RemoveTeamAction = (input: unknown) => Promise<TournamentActionResult>

export function TeamsPanel({
  tournamentId,
  teams,
  maxTeams,
  addAction,
  removeAction,
}: {
  tournamentId: string
  teams: TournamentTeamRow[]
  maxTeams: number | null
  addAction: AddTeamAction
  removeAction: RemoveTeamAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  // El cupo cuenta solo a los que siguen en carrera, igual que el service.
  const active = teams.filter(
    (t) => t.status === 'registered' || t.status === 'confirmed',
  ).length
  const isFull = maxTeams !== null && active >= maxTeams

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addAction({
        tournamentId,
        name: name.trim(),
        contactName: contactName.trim() === '' ? null : contactName.trim(),
        contactPhone: contactPhone.trim() === '' ? null : contactPhone.trim(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setName('')
      setContactName('')
      setContactPhone('')
      router.refresh()
    })
  }

  function handleRemove(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeAction({ id })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Equipos</h2>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {maxTeams === null
            ? `${active} ${active === 1 ? 'equipo anotado' : 'equipos anotados'}`
            : `${active} de ${maxTeams} lugares ocupados`}
        </p>
      </div>

      <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-1.5">
          <label htmlFor="equipo-nombre" className="text-xs font-medium text-muted-foreground">
            Nombre del equipo
          </label>
          <input
            id="equipo-nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Ej: Los Pibes"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="equipo-contacto" className="text-xs font-medium text-muted-foreground">
            Capitán
          </label>
          <input
            id="equipo-contacto"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={120}
            placeholder="Opcional"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="equipo-tel" className="text-xs font-medium text-muted-foreground">
            Teléfono
          </label>
          <input
            id="equipo-tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            maxLength={30}
            inputMode="tel"
            placeholder="Opcional"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending || name.trim() === '' || isFull}
            className="inline-flex h-[38px] w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100 sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Anotar
          </button>
        </div>
      </form>

      {isFull && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          El torneo llegó al cupo. Para anotar más, subí el cupo desde Configuración.
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

      {teams.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <Users className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Todavía no hay equipos anotados.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                {(t.contactName || t.contactPhone) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[t.contactName, t.contactPhone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${teamStatusBadgeClass(t.status)}`}
                >
                  {TEAM_STATUS_LABELS[t.status]}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(t.id)}
                  disabled={pending}
                  aria-label={`Borrar ${t.name}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
