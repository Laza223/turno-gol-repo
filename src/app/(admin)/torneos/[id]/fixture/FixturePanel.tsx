'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, CalendarPlus, LayoutGrid, List, Trash2, Trophy } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/hooks/use-toast'
import { usePersistedFlag } from '@/hooks/use-persisted-flag'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import type {
  TournamentFormat,
  TournamentMatchView,
  TournamentSlotRow,
  TournamentStageRow,
} from '@/modules/tournaments/tournament.types'
import type { GenerateFixtureActionResult, TournamentActionResult } from '../../actions'
import { FixtureListado } from './FixtureListado'
import { PlanillaBoard, type RescheduleMatchAction } from './PlanillaBoard'

export type GenerateFixtureAction = (
  input: unknown,
) => Promise<GenerateFixtureActionResult>
export type ClearFixtureAction = (input: unknown) => Promise<TournamentActionResult>

const LEGS_OPTIONS: ComboboxOption[] = [
  { value: '1', label: 'Solo ida', hint: 'Cada equipo juega una vez contra cada rival' },
  { value: '2', label: 'Ida y vuelta', hint: 'El doble de fechas' },
]

const GROUPS_OPTIONS: ComboboxOption[] = [2, 3, 4, 6, 8].map((n) => ({
  value: String(n),
  label: `${n} zonas`,
}))

const ADVANCE_OPTIONS: ComboboxOption[] = [1, 2, 4].map((n) => ({
  value: String(n),
  label: n === 1 ? 'Clasifica 1 por zona' : `Clasifican ${n} por zona`,
}))

/**
 * La vista se recuerda entre visitas. El flag guarda la elección NO por
 * defecto — "este admin prefiere el listado" — igual que `usePersistedDensity`:
 * sin nada en localStorage el hook devuelve `false`, así que el default tiene
 * que ser el lado falso o la Planilla no sería la vista por defecto. Con
 * `serverValue: false` el HTML del servidor coincide además con el primer
 * render del cliente para quien nunca eligió, que es casi todo el mundo.
 */
const VISTA_KEY = 'tg-torneos-vista-listado'

export function FixturePanel({
  tournamentId,
  format,
  stages,
  matches,
  slots,
  courts,
  matchDurationMinutes,
  restBetweenMatchesMinutes,
  generateAction,
  clearAction,
  rescheduleAction,
}: {
  tournamentId: string
  format: TournamentFormat
  stages: TournamentStageRow[]
  matches: TournamentMatchView[]
  slots: TournamentSlotRow[]
  courts: Array<{ id: string; name: string }>
  matchDurationMinutes: number
  restBetweenMatchesMinutes: number
  generateAction: GenerateFixtureAction
  clearAction: ClearFixtureAction
  rescheduleAction: RescheduleMatchAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [legs, setLegs] = useState('1')
  const [groupsCount, setGroupsCount] = useState('2')
  const [advance, setAdvance] = useState('2')
  const [thirdPlace, setThirdPlace] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const [verListado, setVerListado] = usePersistedFlag(VISTA_KEY, {
    on: 'listado',
    off: 'planilla',
    serverValue: false,
  })
  const verPlanilla = !verListado

  const matchesWithResult = matches.filter((m) => m.status !== 'scheduled').length
  const sinAgendar = matches.filter((m) => m.startsAt === null).length

  function handleGenerate() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await generateAction({
        tournamentId,
        legs: Number(legs) as 1 | 2,
        ...(format === 'groups_playoff'
          ? {
              groupsCount: Number(groupsCount),
              teamsAdvancePerGroup: Number(advance),
            }
          : {}),
        thirdPlace,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setNotice(
        result.unscheduled > 0
          ? `Se generaron ${result.matches} partidos, pero ${result.unscheduled} quedaron sin día ni hora: no alcanzan las horas tomadas. Tomá más horarios, o ubicalos desde la Planilla en los lugares que queden libres.`
          : `Se generaron ${result.matches} partidos y todos entraron en los horarios del torneo.`,
      )
      router.refresh()
    })
  }

  async function confirmClear(): Promise<{ success: boolean; error?: string }> {
    setNotice(null)
    const result = await clearAction({ tournamentId })
    if (result.success) {
      toast({ title: 'Fixture borrado', variant: 'success' })
      router.refresh()
    }
    return result
  }

  /**
   * Feedback compartido por las dos ramas. Vive acá afuera a propósito: el
   * aviso de "N partidos quedaron sin agendar" se emite generando DESDE la
   * rama vacía, y si solo se renderizara en la rama con fixture se perdería —
   * que es justo el mensaje que el admin no se puede perder.
   */
  const feedback = (
    <>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {notice}
        </div>
      )}
    </>
  )

  if (matches.length === 0) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Generar el fixture
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Arma el calendario con los equipos anotados y lo reparte en las horas que el
              torneo ya tiene tomadas. Después podés mover cualquier partido desde la Planilla.
            </p>
          </div>

          {format !== 'knockout' && (
            <div className="space-y-1.5">
              <label htmlFor="fixture-legs" className="text-sm font-medium text-foreground">
                Vueltas
              </label>
              <Combobox
                id="fixture-legs"
                options={LEGS_OPTIONS}
                value={legs}
                onChange={setLegs}
                listboxLabel="Cantidad de vueltas"
              />
            </div>
          )}

          {format === 'groups_playoff' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="fixture-zonas" className="text-sm font-medium text-foreground">
                  Zonas
                </label>
                <Combobox
                  id="fixture-zonas"
                  options={GROUPS_OPTIONS}
                  value={groupsCount}
                  onChange={setGroupsCount}
                  listboxLabel="Cantidad de zonas"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fixture-clasifican" className="text-sm font-medium text-foreground">
                  Clasificados
                </label>
                <Combobox
                  id="fixture-clasifican"
                  options={ADVANCE_OPTIONS}
                  value={advance}
                  onChange={setAdvance}
                  listboxLabel="Equipos que clasifican por zona"
                />
              </div>
            </div>
          )}

          {format !== 'league' && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={thirdPlace}
                onChange={(e) => setThirdPlace(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Jugar el partido por el tercer puesto
            </label>
          )}

          {feedback}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {pending ? 'Generando…' : 'Generar fixture'}
          </button>
        </div>

        <EmptyState
          icon={Trophy}
          title="Todavía no hay fixture"
          description="Anotá los equipos y tomá los horarios; después generá el calendario de partidos."
        />
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {matches.length} {matches.length === 1 ? 'partido' : 'partidos'}
          {sinAgendar > 0 && ` · ${sinAgendar} sin agendar`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Vista del fixture"
            className="inline-flex rounded-lg bg-muted p-1"
          >
            <button
              type="button"
              onClick={() => setVerListado(false)}
              aria-pressed={verPlanilla}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors md:min-h-8 ${
                verPlanilla
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              Planilla
            </button>
            <button
              type="button"
              onClick={() => setVerListado(true)}
              aria-pressed={verListado}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors md:min-h-8 ${
                verPlanilla
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'bg-card text-foreground shadow-xs'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Listado
            </button>
          </div>
          <button
            type="button"
            onClick={() => setClearConfirmOpen(true)}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 md:min-h-9"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Borrar fixture
          </button>
        </div>
      </div>

      {feedback}

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Borrar el fixture"
        consequences={[
          `Se borran los ${matches.length} partidos del calendario.`,
          ...(matchesWithResult > 0
            ? [`Se pierden los ${matchesWithResult} resultados ya cargados.`]
            : []),
          'No se puede deshacer: hay que generar el fixture de nuevo.',
        ]}
        variant="destructive"
        confirmLabel="Borrar fixture"
        cancelLabel="Volver"
        onConfirm={confirmClear}
      />

      {verPlanilla ? (
        <PlanillaBoard
          tournamentId={tournamentId}
          slots={slots}
          matches={matches}
          courts={courts}
          matchDurationMinutes={matchDurationMinutes}
          restBetweenMatchesMinutes={restBetweenMatchesMinutes}
          rescheduleAction={rescheduleAction}
        />
      ) : (
        <FixtureListado tournamentId={tournamentId} stages={stages} matches={matches} />
      )}
    </section>
  )
}
