'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarClock, Check, Trash2 } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/hooks/use-toast'
import type { SlotConflict, TournamentSlotRow } from '@/modules/tournaments/tournament.types'
import type { ReserveSlotsActionResult, TournamentActionResult } from '../actions'
import { formatDate, summarizeSlots } from '../torneos-lib'

export type ReserveSlotsAction = (input: unknown) => Promise<ReserveSlotsActionResult>
export type ReleaseSlotsAction = (input: unknown) => Promise<TournamentActionResult>

type Court = { id: string; name: string }

const HOUR_OPTIONS: ComboboxOption[] = Array.from({ length: 24 }, (_, h) => {
  const v = `${String(h).padStart(2, '0')}:00`
  return { value: v, label: v }
})

// El fin sí puede ser 24:00 (medianoche): es un TIME válido y > '23:00', que es
// lo que pide chk_time_valid para el slot 23:00→24:00.
const END_HOUR_OPTIONS: ComboboxOption[] = [
  ...HOUR_OPTIONS.slice(1),
  { value: '24:00', label: '24:00 (medianoche)' },
]

function todayIso(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

/** Fechas semanales desde `from`, `count` semanas. El caso típico de una liga. */
function weeklyDates(from: string, count: number): string[] {
  const out: string[] = []
  const base = new Date(`${from}T00:00:00Z`)
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 7 * 86_400_000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export function SlotsPanel({
  tournamentId,
  courts,
  slots,
  courtNames,
  reserveAction,
  releaseAction,
}: {
  tournamentId: string
  courts: Court[]
  slots: TournamentSlotRow[]
  courtNames: Record<string, string>
  reserveAction: ReserveSlotsAction
  releaseAction: ReleaseSlotsAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<SlotConflict[] | null>(null)
  const [reserved, setReserved] = useState<number | null>(null)

  const [selectedCourts, setSelectedCourts] = useState<string[]>([])
  const [firstDate, setFirstDate] = useState(todayIso())
  const [weeks, setWeeks] = useState('1')
  const [timeStart, setTimeStart] = useState('14:00')
  const [timeEnd, setTimeEnd] = useState('18:00')
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false)

  const releasingCount = useMemo(() => slots.filter((s) => s.date >= todayIso()).length, [slots])

  const dates = useMemo(
    () => weeklyDates(firstDate, Math.max(1, Number(weeks) || 1)),
    [firstDate, weeks],
  )

  function toggleCourt(id: string) {
    setSelectedCourts((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleReserve() {
    setError(null)
    setConflicts(null)
    setReserved(null)
    if (selectedCourts.length === 0) {
      setError('Elegí al menos una cancha.')
      return
    }
    startTransition(async () => {
      const result = await reserveAction({
        tournamentId,
        courtIds: selectedCourts,
        dates,
        timeStart,
        timeEnd,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setReserved(result.reserved)
      setConflicts(result.conflicts)
      router.refresh()
    })
  }

  async function confirmRelease(): Promise<ActionResult> {
    setConflicts(null)
    setReserved(null)
    const result = await releaseAction({ tournamentId, fromDate: todayIso() })
    if (result.success) {
      toast({
        title: 'Horarios liberados',
        description: `${releasingCount} ${releasingCount === 1 ? 'hora queda libre' : 'horas quedan libres'} para reservar online.`,
        variant: 'success',
      })
      router.refresh()
    }
    return result
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Tomar horarios</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Las horas que elijas quedan reservadas en la grilla a nombre del torneo. Si alguna ya
            está ocupada, se saltea y te la mostramos.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Canchas</legend>
          <div className="flex flex-wrap gap-2">
            {courts.map((c) => {
              const active = selectedCourts.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCourt(c.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted text-foreground hover:bg-accent'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {c.name}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="slots-desde" className="text-sm font-medium text-foreground">
              Primera fecha
            </label>
            <DatePicker id="slots-desde" value={firstDate} onChange={setFirstDate} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="slots-semanas" className="text-sm font-medium text-foreground">
              Repetir por
            </label>
            <div className="relative">
              <input
                id="slots-semanas"
                type="number"
                inputMode="numeric"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-3 pr-20 text-sm tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {Number(weeks) === 1 ? 'semana' : 'semanas'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="slots-inicio" className="text-sm font-medium text-foreground">
              Desde las
            </label>
            <Combobox
              id="slots-inicio"
              options={HOUR_OPTIONS}
              value={timeStart}
              onChange={setTimeStart}
              listboxLabel="Hora de inicio"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="slots-fin" className="text-sm font-medium text-foreground">
              Hasta las
            </label>
            <Combobox
              id="slots-fin"
              options={END_HOUR_OPTIONS}
              value={timeEnd}
              onChange={setTimeEnd}
              listboxLabel="Hora de fin"
            />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {dates.length === 1
            ? `Se van a tomar horarios el ${formatDate(dates[0]!)}.`
            : `Se van a tomar horarios en ${dates.length} fechas, del ${formatDate(dates[0]!)} al ${formatDate(dates[dates.length - 1]!)}.`}
        </p>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {reserved !== null && (
          <div
            role="status"
            className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm"
          >
            <p className="font-medium text-emerald-800 dark:text-emerald-300">
              Se tomaron {reserved} {reserved === 1 ? 'hora' : 'horas'}.
            </p>
            {conflicts && conflicts.length > 0 && (
              <div className="mt-2 text-muted-foreground">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {conflicts.length} {conflicts.length === 1 ? 'hora' : 'horas'} ya estaban ocupadas
                  y se saltearon:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {conflicts.slice(0, 8).map((c, i) => (
                    <li key={`${c.courtId}-${c.date}-${c.timeStart}-${i}`}>
                      {formatDate(c.date)} · {c.timeStart} · {courtNames[c.courtId] ?? 'Cancha'}
                    </li>
                  ))}
                  {conflicts.length > 8 && <li>y {conflicts.length - 8} más…</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleReserve}
          disabled={pending || selectedCourts.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"
        >
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Tomando…' : 'Tomar estos horarios'}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Horarios tomados</h2>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {summarizeSlots(slots)}
            </p>
          </div>
          {slots.length > 0 && (
            <button
              type="button"
              onClick={() => setReleaseConfirmOpen(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Liberar de hoy en adelante
            </button>
          )}
        </div>

        {slots.length === 0 ? (
          <EmptyState
            title="Todavía no reservaste ningún horario para este torneo."
            className="py-6"
          />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {slots.slice(0, 40).map((s) => (
              <li key={s.bookingId} className="flex items-center justify-between py-2">
                <span className="text-foreground tabular-nums">
                  {formatDate(s.date)} · {s.timeStart}–{s.timeEnd}
                </span>
                <span className="text-muted-foreground">{courtNames[s.courtId] ?? 'Cancha'}</span>
              </li>
            ))}
            {slots.length > 40 && (
              <li className="py-2 text-muted-foreground">y {slots.length - 40} horas más…</li>
            )}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={releaseConfirmOpen}
        onOpenChange={setReleaseConfirmOpen}
        title="Liberar horarios de hoy en adelante"
        consequences={[
          `${releasingCount} ${releasingCount === 1 ? 'hora queda' : 'horas quedan'} libres para que cualquiera las reserve online.`,
          'No se puede deshacer: para recuperarlas hay que volver a tomarlas (y podrían estar ocupadas).',
        ]}
        variant="destructive"
        confirmLabel="Liberar horarios"
        cancelLabel="Volver"
        onConfirm={confirmRelease}
      />
    </section>
  )
}
