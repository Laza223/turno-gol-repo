'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Lock, Shuffle } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { TournamentActionResult } from '../../actions'
import type { CorteState, CrossPreview, TiedTeam } from './corte-lib'

/**
 * El corte: cerrar las zonas y sortear los cruces.
 *
 * `seedPlayoffs` ya existía con el nombre del botón escrito en su doc
 * (`/** Botón "Cerrar zonas y sortear cruces". *​/`) pero sin botón. Acá no es
 * un botón suelto sino el ESTADO del corte: cuántos partidos de zona faltan,
 * cómo quedarían los cruces con la tabla de hoy, y qué falta resolver antes.
 *
 * Los tres bloqueos que `seedPlayoffs` puede tirar se muestran ANTES de
 * intentar, con el mismo criterio que usa el service:
 *  - `GroupStageNotFinishedError` → la cuenta de partidos que faltan.
 *  - `StandingsTieUnresolvedError` → el sorteo de desempate, que se resuelve acá.
 *  - rol insuficiente → candado, no desaparición (MASTER §12).
 */

type SeedPlayoffsAction = (input: unknown) => Promise<TournamentActionResult>
type UpdateTeamSeedAction = (input: unknown) => Promise<TournamentActionResult>

type Props = {
  tournamentId: string
  /** Partidos de zona sin cerrar. Con uno solo, sembrar es imposible. */
  pendingGroupMatches: number
  crosses: CrossPreview[]
  /** Empate irresoluble justo en la línea de corte, si lo hay. */
  tie: CorteState['tie']
  /** El cuadro ya tiene equipos: el corte ya se hizo. */
  alreadySeeded: boolean
  /** Sembrar es configuración: solo el dueño. */
  canSeed: boolean
  seedAction: SeedPlayoffsAction
  updateTeamAction: UpdateTeamSeedAction
}

export function CorteZonasCard({
  tournamentId,
  pendingGroupMatches,
  crosses,
  tie,
  alreadySeeded,
  canSeed,
  seedAction,
  updateTeamAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [tieOpen, setTieOpen] = useState(false)

  const blocked = pendingGroupMatches > 0 || tie !== null
  const ready = !blocked && !alreadySeeded
  const showRounds = new Set(crosses.map((c) => c.round)).size > 1

  async function confirmSeed(): Promise<ActionResult> {
    const result = await seedAction({ tournamentId })
    if (result.success) {
      toast({
        title: 'Cruces sorteados',
        description: 'El cuadro quedó armado con los clasificados de cada zona.',
        variant: 'success',
      })
      router.refresh()
    }
    return result
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground">
            {alreadySeeded ? 'Cruces sorteados' : 'Cerrar zonas y sortear cruces'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {alreadySeeded
              ? 'El cuadro ya está armado. Si corregís un resultado de zona, los cruces se rearman solos.'
              : 'Cuando terminen todas las zonas, el cuadro se arma con los clasificados de cada una.'}
          </p>
        </div>

        {!alreadySeeded &&
          (canSeed ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!ready || pending}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100 md:min-h-10"
            >
              <Shuffle className="h-4 w-4" aria-hidden="true" />
              Cerrar zonas y sortear
            </button>
          ) : (
            // Bloqueado por rol: se muestra con candado, no se esconde.
            <span
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground md:min-h-10"
              title="Solo el dueño puede cerrar las zonas"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Cerrar zonas y sortear
              <span className="sr-only">— solo el dueño puede hacerlo</span>
            </span>
          ))}
      </div>

      {pendingGroupMatches > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
            aria-hidden="true"
          />
          <span>
            <span className="font-medium tabular-nums">
              {pendingGroupMatches === 1
                ? 'Falta 1 partido de zona'
                : `Faltan ${pendingGroupMatches} partidos de zona`}
            </span>{' '}
            por jugar. Cargá los resultados y el cuadro se puede sortear.
          </span>
        </p>
      )}

      {tie && (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5 dark:bg-amber-500/10">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium">Zona {tie.groupLabel}</span>:{' '}
              {tie.teams.map((t) => t.teamName).join(' y ')} están empatados justo en el puesto de
              corte y ningún criterio los separa.
            </span>
          </p>
          <button
            type="button"
            onClick={() => setTieOpen(true)}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-warning/10 disabled:pointer-events-none disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-500/15 md:min-h-9"
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            Definir el sorteo
          </button>
        </div>
      )}

      {/* Los errores del servidor los muestra el ConfirmDialog inline, sin
          cerrarse: no hace falta un segundo banner a nivel de tarjeta. */}

      {crosses.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {alreadySeeded ? 'Los cruces' : 'Así quedarían los cruces'}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {crosses.map((cross) => (
              <li
                key={cross.id}
                className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                {/* La ronda solo cuando el cuadro tiene más de una sembrada, o
                    sea cuando hay BYE: ahí "1º Zona A" entra recién en semis y
                    sin decirlo el cruce se lee como si fuera de la misma fecha. */}
                {showRounds && (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {cross.round}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  {/* Los dos lados apuntan al "vs" del medio, como un marcador:
                      alineados hacia afuera quedaban en las puntas de una fila
                      ancha y había que barrer la pantalla para leer el cruce. */}
                  <CrossSide label={cross.homeLabel} teamName={cross.homeTeamName} align="right" />
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">vs</span>
                  <CrossSide label={cross.awayLabel} teamName={cross.awayTeamName} />
                </div>
              </li>
            ))}
          </ul>
          {!alreadySeeded && crosses.some((c) => c.homeTeamName === null) && (
            <p className="text-xs text-muted-foreground">
              Los equipos se confirman al cerrar las zonas.
            </p>
          )}
        </div>
      )}

      {alreadySeeded && (
        <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Las zonas están cerradas.
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cerrar las zonas y sortear los cruces"
        consequences={[
          'El cuadro queda armado con los clasificados de cada zona.',
          'Si después corregís un resultado de zona, los cruces se rearman solos.',
          'Una vez que se juegue un cruce, el cuadro deja de poder rearmarse.',
        ]}
        confirmLabel="Cerrar zonas y sortear"
        cancelLabel="Volver"
        onConfirm={confirmSeed}
      />

      {tie && (
        <SorteoDesempateDialog
          open={tieOpen}
          onOpenChange={setTieOpen}
          groupLabel={tie.groupLabel}
          teams={tie.teams}
          updateTeamAction={updateTeamAction}
          // Recargar es lo que hace desaparecer el aviso de empate: con los
          // seeds cargados, `qualifiedSeeds` ya no tira y el corte se destraba.
          onSaved={() => startTransition(() => router.refresh())}
        />
      )}
    </section>
  )
}

function CrossSide({
  label,
  teamName,
  align = 'left',
}: {
  label: string
  teamName: string | null
  align?: 'left' | 'right'
}) {
  return (
    <span className={`min-w-0 flex-1 ${align === 'right' ? 'text-right' : ''}`}>
      <span className="block truncate font-medium text-foreground">{teamName ?? label}</span>
      {teamName && <span className="block truncate text-xs text-muted-foreground">{label}</span>}
    </span>
  )
}

/**
 * Sorteo de desempate: el eslabón que faltaba.
 *
 * El propio mensaje de error del servidor dice "cargales el número de siembra
 * para definir el sorteo", y hasta ahora no había forma de cargarlo. El número
 * se guarda en `tournament_teams.seed`, que es lo que lee el criterio
 * `drawn_lots` — el sistema no sortea, registra el sorteo que se hizo con una
 * moneda o un papelito, que es como se resuelve en la cancha.
 */
function SorteoDesempateDialog({
  open,
  onOpenChange,
  groupLabel,
  teams,
  updateTeamAction,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupLabel: string
  teams: TiedTeam[]
  updateTeamAction: UpdateTeamSeedAction
  onSaved: () => void
}) {
  const [seeds, setSeeds] = useState<Record<string, string>>(() =>
    Object.fromEntries(teams.map((t, i) => [t.teamId, String(t.seed ?? i + 1)])),
  )

  const values = teams.map((t) => Number(seeds[t.teamId] ?? ''))
  const allFilled = values.every((v) => Number.isInteger(v) && v > 0)
  const allDistinct = new Set(values).size === values.length
  const valid = allFilled && allDistinct

  async function save(): Promise<ActionResult> {
    if (!valid) {
      return {
        success: false,
        error: allFilled
          ? 'Dos equipos no pueden tener el mismo número.'
          : 'Cargá un número mayor a cero para cada equipo.',
      }
    }
    // Una escritura por equipo, no una transacción: si la segunda falla, la
    // primera ya quedó. Se banca porque `updateTeam` es idempotente para el
    // mismo valor — reintentar completa el sorteo — y porque hasta que TODOS
    // los seeds no estén cargados el corte sigue bloqueado, así que un estado
    // a medias no habilita nada.
    for (const team of teams) {
      const result = await updateTeamAction({
        id: team.teamId,
        seed: Number(seeds[team.teamId]),
      })
      if (!result.success) return result
    }
    toast({
      title: 'Sorteo cargado',
      description: `Zona ${groupLabel}: el desempate quedó definido.`,
      variant: 'success',
    })
    onSaved()
    return { success: true }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Sorteo de desempate — Zona ${groupLabel}`}
      description="Ningún criterio los separa y están justo en el puesto de corte. Hacé el sorteo como lo harías en la cancha y cargá el orden acá: el número 1 pasa primero."
      confirmLabel="Guardar el sorteo"
      cancelLabel="Volver"
      onConfirm={save}
    >
      <ul className="space-y-2">
        {teams.map((team) => (
          <li key={team.teamId} className="flex items-center gap-3">
            <label
              htmlFor={`sorteo-${team.teamId}`}
              className="min-w-0 flex-1 truncate text-sm text-foreground"
            >
              {team.teamName}
            </label>
            <input
              id={`sorteo-${team.teamId}`}
              type="number"
              min={1}
              max={64}
              inputMode="numeric"
              value={seeds[team.teamId] ?? ''}
              onChange={(e) => setSeeds((prev) => ({ ...prev, [team.teamId]: e.target.value }))}
              className="h-11 w-20 shrink-0 rounded-md border border-border bg-card px-3 text-base text-foreground tabular-nums focus:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm"
            />
          </li>
        ))}
      </ul>
      {!allDistinct && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          Dos equipos no pueden tener el mismo número.
        </p>
      )}
    </ConfirmDialog>
  )
}
