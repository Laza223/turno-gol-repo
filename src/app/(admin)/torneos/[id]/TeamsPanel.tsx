'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Users, X } from 'lucide-react'
import type {
  TournamentTeamPlayerRow,
  TournamentTeamRow,
} from '@/modules/tournaments/tournament.types'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import type { SearchPlayersActionResult, TournamentActionResult } from '../actions'
import { TEAM_STATUS_LABELS, teamStatusBadgeClass } from '../torneos-lib'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/hooks/use-toast'

export type AddTeamAction = (input: unknown) => Promise<TournamentActionResult>
export type RemoveTeamAction = (input: unknown) => Promise<TournamentActionResult>
export type SearchCaptainAction = (input: unknown) => Promise<SearchPlayersActionResult>
export type AddTeamPlayerAction = (input: unknown) => Promise<TournamentActionResult>
export type RemoveTeamPlayerAction = (input: unknown) => Promise<TournamentActionResult>

export function TeamsPanel({
  tournamentId,
  teams,
  maxTeams,
  rosters,
  addAction,
  removeAction,
  searchCaptainAction,
  addPlayerAction,
  removePlayerAction,
}: {
  tournamentId: string
  teams: TournamentTeamRow[]
  maxTeams: number | null
  /** Plantel de cada equipo, indexado por team id. */
  rosters: Record<string, TournamentTeamPlayerRow[]>
  addAction: AddTeamAction
  removeAction: RemoveTeamAction
  searchCaptainAction: SearchCaptainAction
  addPlayerAction: AddTeamPlayerAction
  removePlayerAction: RemoveTeamPlayerAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPlayerId, setContactPlayerId] = useState<string | null>(null)
  const [contactPhone, setContactPhone] = useState('')

  // Autocomplete de capitán: mientras no se elige un resultado, viaja como
  // texto libre igual que antes (contactPlayerId queda null).
  const [captainResults, setCaptainResults] = useState<PlayerSearchResult[]>([])
  const [captainOpen, setCaptainOpen] = useState(false)
  const captainDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<TournamentTeamRow | null>(null)

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
        contactPlayerId,
        contactName: contactName.trim() === '' ? null : contactName.trim(),
        contactPhone: contactPhone.trim() === '' ? null : contactPhone.trim(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({ title: 'Equipo anotado', description: name.trim(), variant: 'success' })
      setName('')
      setContactName('')
      setContactPlayerId(null)
      setContactPhone('')
      router.refresh()
    })
  }

  async function confirmRemoveTeam(): Promise<{ success: boolean; error?: string }> {
    if (!removeConfirm) return { success: false, error: 'No hay equipo seleccionado.' }
    const res = await removeAction({ id: removeConfirm.id })
    if (res.success) {
      toast({ title: 'Equipo borrado', description: removeConfirm.name, variant: 'success' })
      router.refresh()
    }
    return res
  }

  function onCaptainChange(next: string) {
    setContactName(next)
    setContactPlayerId(null)
    if (captainDebounceRef.current) clearTimeout(captainDebounceRef.current)
    const q = next.trim()
    if (q.length < 2) {
      setCaptainResults([])
      setCaptainOpen(false)
      return
    }
    captainDebounceRef.current = setTimeout(() => {
      void (async () => {
        const result = await searchCaptainAction({ query: q })
        if (result.success) {
          setCaptainResults(result.players)
          setCaptainOpen(result.players.length > 0)
        }
      })()
    }, 300)
  }

  function selectCaptain(player: PlayerSearchResult) {
    setContactName(player.name)
    setContactPlayerId(player.id)
    setCaptainResults([])
    setCaptainOpen(false)
  }

  useEffect(() => {
    return () => {
      if (captainDebounceRef.current) clearTimeout(captainDebounceRef.current)
    }
  }, [])

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
        <div className="relative space-y-1.5">
          <label htmlFor="equipo-contacto" className="text-xs font-medium text-muted-foreground">
            Capitán
          </label>
          <input
            id="equipo-contacto"
            value={contactName}
            onChange={(e) => onCaptainChange(e.target.value)}
            onFocus={() => {
              if (captainResults.length > 0) setCaptainOpen(true)
            }}
            onBlur={() => {
              // Delay para que el mousedown de la opción llegue a disparar antes.
              setTimeout(() => setCaptainOpen(false), 150)
            }}
            autoComplete="off"
            maxLength={120}
            placeholder="Buscar jugador u opcional"
            role="combobox"
            aria-expanded={captainOpen}
            aria-autocomplete="list"
            aria-controls="equipo-contacto-listbox"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
          {contactPlayerId && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Vinculado a un jugador registrado.
            </p>
          )}
          {captainOpen && captainResults.length > 0 && (
            <ul
              id="equipo-contacto-listbox"
              className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
            >
              {captainResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCaptain(p)}
                    className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="truncate text-foreground">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        <EmptyState icon={Users} title="Todavía no hay equipos anotados." />
      ) : (
        <ul className="divide-y divide-border">
          {teams.map((t) => {
            const players = rosters[t.id] ?? []
            const isExpanded = expandedTeamId === t.id
            return (
              <li key={t.id}>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedTeamId(isExpanded ? null : t.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[t.contactName, t.contactPhone].filter(Boolean).join(' · ')}
                        {(t.contactName || t.contactPhone) && players.length > 0 ? ' · ' : ''}
                        {players.length > 0
                          ? `${players.length} en el plantel`
                          : t.contactName || t.contactPhone
                            ? ''
                            : 'Sin plantel cargado'}
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${teamStatusBadgeClass(t.status)}`}
                    >
                      {TEAM_STATUS_LABELS[t.status]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemoveConfirm(t)}
                      disabled={pending}
                      aria-label={`Borrar ${t.name}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <TeamRosterEditor
                    teamId={t.id}
                    players={players}
                    addPlayerAction={addPlayerAction}
                    removePlayerAction={removePlayerAction}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={removeConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveConfirm(null)
        }}
        title={`Borrar ${removeConfirm?.name ?? 'equipo'}`}
        consequences={[
          'Se borra el plantel completo junto con el equipo.',
          'No se puede deshacer.',
        ]}
        variant="destructive"
        confirmLabel="Borrar equipo"
        cancelLabel="Volver"
        onConfirm={confirmRemoveTeam}
      />
    </section>
  )
}

/** Alta/baja del plantel de un equipo, dentro de su fila expandida. */
function TeamRosterEditor({
  teamId,
  players,
  addPlayerAction,
  removePlayerAction,
}: {
  teamId: string
  players: TournamentTeamPlayerRow[]
  addPlayerAction: AddTeamPlayerAction
  removePlayerAction: RemoveTeamPlayerAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [shirtNumber, setShirtNumber] = useState('')
  const [dni, setDni] = useState('')

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addPlayerAction({
        teamId,
        fullName: fullName.trim(),
        shirtNumber: shirtNumber.trim() === '' ? null : Number(shirtNumber),
        dni: dni.trim() === '' ? null : dni.trim(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({ title: 'Jugador agregado al plantel', description: fullName.trim(), variant: 'success' })
      setFullName('')
      setShirtNumber('')
      setDni('')
      router.refresh()
    })
  }

  function undoRemove(p: TournamentTeamPlayerRow) {
    startTransition(async () => {
      await addPlayerAction({
        teamId,
        fullName: p.fullName,
        playerId: p.playerId,
        dni: p.dni,
        shirtNumber: p.shirtNumber,
      })
      router.refresh()
    })
  }

  function handleRemove(p: TournamentTeamPlayerRow) {
    setError(null)
    startTransition(async () => {
      const result = await removePlayerAction({ id: p.id })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({
        title: 'Sacado del plantel',
        description: p.fullName,
        variant: 'success',
        action: { label: 'Deshacer', onClick: () => undoRemove(p) },
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3 sm:px-8">
      {players.length === 0 ? (
        <EmptyState title="Todavía no hay plantel cargado." className="py-4" />
      ) : (
        <ul className="space-y-1">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">
                {p.shirtNumber !== null && (
                  <span className="mr-1.5 tabular-nums text-muted-foreground">
                    #{p.shirtNumber}
                  </span>
                )}
                {p.fullName}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(p)}
                disabled={pending}
                aria-label={`Sacar a ${p.fullName} del plantel`}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={120}
          placeholder="Nombre del jugador"
          aria-label="Nombre del jugador"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="number"
          min={0}
          max={999}
          value={shirtNumber}
          onChange={(e) => setShirtNumber(e.target.value)}
          placeholder="Nº"
          aria-label="Número de camiseta"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          maxLength={9}
          inputMode="numeric"
          placeholder="DNI (opcional)"
          aria-label="DNI"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={pending || fullName.trim() === ''}
          className="inline-flex h-[34px] items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Agregar
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
