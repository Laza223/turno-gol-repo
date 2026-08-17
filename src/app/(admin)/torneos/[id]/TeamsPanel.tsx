'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronDown, ChevronUp, Pencil, Plus, Users, X } from 'lucide-react'
import type {
  TournamentTeamPlayerRow,
  TournamentTeamRow,
  TournamentTeamStatus,
} from '@/modules/tournaments/tournament.types'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import type { SearchPlayersActionResult, TournamentActionResult } from '../actions'
import { TEAM_STATUS_LABELS, formatArs, teamStatusBadgeClass } from '../torneos-lib'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { MoneyInput } from '@/components/ui/money-input'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { toast } from '@/hooks/use-toast'

export type AddTeamAction = (input: unknown) => Promise<TournamentActionResult>
export type RemoveTeamAction = (input: unknown) => Promise<TournamentActionResult>
export type UpdateTeamAction = (input: unknown) => Promise<TournamentActionResult>
export type SearchCaptainAction = (input: unknown) => Promise<SearchPlayersActionResult>
export type AddTeamPlayerAction = (input: unknown) => Promise<TournamentActionResult>
export type RemoveTeamPlayerAction = (input: unknown) => Promise<TournamentActionResult>

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:text-sm'

/**
 * Qué pasa de verdad cuando un equipo deja de estar en carrera. Sale del cupo
 * (`addTeam` solo cuenta registered/confirmed), sale de los clasificados
 * (`qualifiedSeeds` lo saltea) y sus partidos jugados NO se anulan — punto
 * abierto declarado en el design doc de Torneos, así que se dice en vez de
 * dejar que se descubra.
 */
const OUT_CONSEQUENCES = [
  'Deja de ocupar un lugar del cupo del torneo.',
  'Sale de la tabla de clasificados a playoffs.',
  'Los partidos que ya jugó quedan como están, con sus resultados.',
]

const STATUS_HINTS: Record<TournamentTeamStatus, string> = {
  registered: 'Anotado, todavía sin confirmar.',
  confirmed: 'Confirmado: juega.',
  withdrawn: 'Se bajó del torneo.',
  disqualified: 'Sacado del torneo por sanción.',
}

export function TeamsPanel({
  tournamentId,
  teams,
  maxTeams,
  rosters,
  addAction,
  removeAction,
  updateAction,
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
  updateAction: UpdateTeamAction
  searchCaptainAction: SearchCaptainAction
  addPlayerAction: AddTeamPlayerAction
  removePlayerAction: RemoveTeamPlayerAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [captain, setCaptain] = useState<{ name: string; playerId: string | null }>({
    name: '',
    playerId: null,
  })
  const [contactPhone, setContactPhone] = useState('')

  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<TournamentTeamRow | null>(null)

  // El cupo cuenta solo a los que siguen en carrera, igual que el service.
  const active = teams.filter((t) => t.status === 'registered' || t.status === 'confirmed').length
  const isFull = maxTeams !== null && active >= maxTeams

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addAction({
        tournamentId,
        name: name.trim(),
        contactPlayerId: captain.playerId,
        contactName: captain.name.trim() === '' ? null : captain.name.trim(),
        contactPhone: contactPhone.trim() === '' ? null : contactPhone.trim(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({ title: 'Equipo anotado', description: name.trim(), variant: 'success' })
      setName('')
      setCaptain({ name: '', playerId: null })
      setContactPhone('')
      router.refresh()
    })
  }

  async function confirmRemoveTeam(): Promise<ActionResult> {
    if (!removeConfirm) return { success: false, error: 'No hay equipo seleccionado.' }
    const res = await removeAction({ id: removeConfirm.id })
    if (res.success) {
      toast({ title: 'Equipo borrado', description: removeConfirm.name, variant: 'success' })
      router.refresh()
    }
    return res
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
            className={INPUT_CLASS}
          />
        </div>
        <CaptainAutocomplete
          id="equipo-contacto"
          label="Capitán"
          value={captain}
          onChange={setCaptain}
          searchAction={searchCaptainAction}
        />
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
            className={`${INPUT_CLASS} tabular-nums`}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending || name.trim() === '' || isFull}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100 sm:w-auto md:h-[38px]"
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
                      <ChevronUp
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
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
                  <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3 sm:px-8">
                    <TeamEditor
                      team={t}
                      updateAction={updateAction}
                      searchCaptainAction={searchCaptainAction}
                    />
                    <TeamRosterEditor
                      teamId={t.id}
                      players={players}
                      addPlayerAction={addPlayerAction}
                      removePlayerAction={removePlayerAction}
                    />
                  </div>
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

/**
 * Buscador de capitán entre los jugadores que ya jugaron en el complejo.
 * Mientras no se elige un resultado, el nombre viaja como texto libre
 * (`playerId` queda en null): el 80% de los capitanes no tiene cuenta.
 */
function CaptainAutocomplete({
  id,
  label,
  value,
  onChange,
  searchAction,
  disabled,
}: {
  id: string
  label: string
  value: { name: string; playerId: string | null }
  onChange: (next: { name: string; playerId: string | null }) => void
  searchAction: SearchCaptainAction
  disabled?: boolean
}) {
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onNameChange(next: string) {
    onChange({ name: next, playerId: null })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = next.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const result = await searchAction({ query: q })
        if (result.success) {
          setResults(result.players)
          setOpen(result.players.length > 0)
        }
      })()
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value.name}
        onChange={(e) => onNameChange(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true)
        }}
        onBlur={() => {
          // Delay para que el mousedown de la opción llegue a disparar antes.
          setTimeout(() => setOpen(false), 150)
        }}
        disabled={disabled}
        autoComplete="off"
        maxLength={120}
        placeholder="Buscar jugador u opcional"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        className={INPUT_CLASS}
      />
      {value.playerId && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Vinculado a un jugador registrado.
        </p>
      )}
      {open && results.length > 0 && (
        <ul
          id={`${id}-listbox`}
          className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ name: p.name, playerId: p.id })
                  setResults([])
                  setOpen(false)
                }}
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
  )
}

/**
 * Estado del equipo y datos editables, dentro de su fila expandida.
 *
 * El estado va arriba y siempre visible porque es la acción urgente: un equipo
 * que se baja hay que marcarlo el sábado a la mañana, con gente esperando. Los
 * datos (nombre, contacto, arancel) se editan una vez cada tanto, así que van
 * detrás de un "Editar datos".
 */
function TeamEditor({
  team,
  updateAction,
  searchCaptainAction,
}: {
  team: TournamentTeamRow
  updateAction: UpdateTeamAction
  searchCaptainAction: SearchCaptainAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<TournamentTeamStatus | null>(null)
  const [editing, setEditing] = useState(false)

  function applyStatus(
    next: TournamentTeamStatus,
    { withUndo }: { withUndo: boolean },
  ): Promise<TournamentActionResult> {
    const previous = team.status
    return updateAction({ id: team.id, status: next }).then((result) => {
      if (!result.success) return result
      toast({
        title: `${team.name}: ${TEAM_STATUS_LABELS[next].toLowerCase()}`,
        variant: 'success',
        ...(withUndo
          ? {
              action: {
                label: 'Deshacer',
                onClick: () => {
                  startTransition(async () => {
                    await updateAction({ id: team.id, status: previous })
                    router.refresh()
                  })
                },
              },
            }
          : {}),
      })
      router.refresh()
      return result
    })
  }

  function onStatusChange(raw: string) {
    const next = raw as TournamentTeamStatus
    if (next === team.status) return
    setError(null)
    // Bajar o descalificar tiene consecuencias que hay que decir antes (Clase B).
    // Volver a anotar o confirmar es reversible y barato (Clase A).
    if (next === 'withdrawn' || next === 'disqualified') {
      setStatusConfirm(next)
      return
    }
    startTransition(async () => {
      const result = await applyStatus(next, { withUndo: true })
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Estado
        </legend>
        <RadioChipGroup
          value={team.status}
          onValueChange={onStatusChange}
          disabled={pending}
          aria-label={`Estado de ${team.name}`}
          className="grid gap-1.5 sm:grid-cols-2"
        >
          {(['registered', 'confirmed', 'withdrawn', 'disqualified'] as TournamentTeamStatus[]).map(
            (status) => (
              <RadioChip key={status} value={status} description={STATUS_HINTS[status]}>
                {TEAM_STATUS_LABELS[status]}
              </RadioChip>
            ),
          )}
        </RadioChipGroup>
      </fieldset>

      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {editing ? (
        <TeamDataForm
          team={team}
          updateAction={updateAction}
          searchCaptainAction={searchCaptainAction}
          onDone={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-primary/10 dark:text-emerald-300 dark:hover:bg-emerald-500/15 md:min-h-9"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Editar datos
          {team.inscriptionFee > 0 && (
            <span className="text-muted-foreground tabular-nums">
              · Arancel {formatArs(team.inscriptionFee)}
            </span>
          )}
        </button>
      )}

      <ConfirmDialog
        open={statusConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setStatusConfirm(null)
        }}
        title={
          statusConfirm === 'disqualified'
            ? `Descalificar a ${team.name}`
            : `${team.name} se bajó del torneo`
        }
        consequences={
          statusConfirm === 'disqualified'
            ? [...OUT_CONSEQUENCES, 'Queda listado como descalificado en la tabla de posiciones.']
            : OUT_CONSEQUENCES
        }
        variant={statusConfirm === 'disqualified' ? 'destructive' : 'default'}
        confirmLabel={statusConfirm === 'disqualified' ? 'Descalificar' : 'Marcar que se bajó'}
        cancelLabel="Volver"
        onConfirm={async () => {
          if (!statusConfirm) return { success: false, error: 'No hay estado elegido.' }
          return applyStatus(statusConfirm, { withUndo: false })
        }}
      />
    </div>
  )
}

/** Nombre, contacto, arancel y notas del equipo. */
function TeamDataForm({
  team,
  updateAction,
  searchCaptainAction,
  onDone,
}: {
  team: TournamentTeamRow
  updateAction: UpdateTeamAction
  searchCaptainAction: SearchCaptainAction
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(team.name)
  const [captain, setCaptain] = useState<{ name: string; playerId: string | null }>({
    name: team.contactName ?? '',
    playerId: team.contactPlayerId,
  })
  const [phone, setPhone] = useState(team.contactPhone ?? '')
  const [fee, setFee] = useState<number | null>(team.inscriptionFee)
  const [notes, setNotes] = useState(team.notes ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateAction({
        id: team.id,
        name: name.trim(),
        contactPlayerId: captain.playerId,
        contactName: captain.name.trim() === '' ? null : captain.name.trim(),
        contactPhone: phone.trim() === '' ? null : phone.trim(),
        inscriptionFee: fee ?? 0,
        notes: notes.trim() === '' ? null : notes.trim(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({ title: 'Equipo actualizado', description: name.trim(), variant: 'success' })
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label
            htmlFor={`equipo-${team.id}-nombre`}
            className="text-xs font-medium text-muted-foreground"
          >
            Nombre del equipo
          </label>
          <input
            id={`equipo-${team.id}-nombre`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className={INPUT_CLASS}
          />
        </div>
        <CaptainAutocomplete
          id={`equipo-${team.id}-capitan`}
          label="Capitán"
          value={captain}
          onChange={setCaptain}
          searchAction={searchCaptainAction}
          disabled={pending}
        />
        <div className="space-y-1.5">
          <label
            htmlFor={`equipo-${team.id}-tel`}
            className="text-xs font-medium text-muted-foreground"
          >
            Teléfono
          </label>
          <input
            id={`equipo-${team.id}-tel`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            inputMode="tel"
            placeholder="Opcional"
            className={`${INPUT_CLASS} tabular-nums`}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label
            htmlFor={`equipo-${team.id}-arancel`}
            className="text-xs font-medium text-muted-foreground"
          >
            Arancel de inscripción
          </label>
          <MoneyInput
            id={`equipo-${team.id}-arancel`}
            valueCents={fee}
            onValueChange={setFee}
            minCents={0}
            disabled={pending}
          />
          {/* El arancel es un snapshot por equipo: cambiarlo acá no toca a los
              demás ni pone en deuda a quien ya pagó lo que se le había dicho. */}
          <p className="text-xs text-muted-foreground">Solo para este equipo.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor={`equipo-${team.id}-notas`}
            className="text-xs font-medium text-muted-foreground"
          >
            Notas internas
          </label>
          <textarea
            id={`equipo-${team.id}-notas`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="No se publican en el portal."
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || name.trim() === ''}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 md:h-9"
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 md:h-9"
        >
          Cancelar
        </button>
      </div>
    </form>
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
      toast({
        title: 'Jugador agregado al plantel',
        description: fullName.trim(),
        variant: 'success',
      })
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
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plantel</p>
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
          className={INPUT_CLASS}
        />
        <input
          type="number"
          min={0}
          max={999}
          value={shirtNumber}
          onChange={(e) => setShirtNumber(e.target.value)}
          placeholder="Nº"
          aria-label="Número de camiseta"
          className={`${INPUT_CLASS} tabular-nums`}
        />
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          maxLength={9}
          inputMode="numeric"
          placeholder="DNI (opcional)"
          aria-label="DNI"
          className={`${INPUT_CLASS} tabular-nums`}
        />
        <button
          type="submit"
          disabled={pending || fullName.trim() === ''}
          className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 md:h-[34px]"
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
