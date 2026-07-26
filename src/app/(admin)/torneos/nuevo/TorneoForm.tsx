'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, CalendarDays, Trophy, Users } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import type { TournamentActionResult } from '../actions'
import { FORMAT_LABELS } from '../torneos-lib'

export type CreateTournamentAction = (
  input: unknown,
) => Promise<TournamentActionResult>

const FORMAT_OPTIONS: ComboboxOption[] = [
  {
    value: 'league',
    label: FORMAT_LABELS.league,
    hint: 'Cada equipo juega contra todos. El que más horarios ocupa.',
  },
  {
    value: 'knockout',
    label: FORMAT_LABELS.knockout,
    hint: 'Llaves: el que pierde queda afuera.',
  },
  {
    value: 'groups_playoff',
    label: FORMAT_LABELS.groups_playoff,
    hint: 'Zonas y después cruces. El típico de fin de semana.',
  },
]

/**
 * Presets de duración de partido. Es la duración del PARTIDO, no del turno de
 * la grilla: el torneo toma horas enteras y adentro entran uno o dos partidos.
 */
const DURATION_OPTIONS: ComboboxOption[] = [
  { value: '60', label: '60 minutos', hint: 'Un partido por hora' },
  { value: '50', label: '50 minutos', hint: 'Un partido por hora, con recambio' },
  { value: '30', label: '30 minutos', hint: 'Dos partidos por hora' },
  { value: '25', label: '25 minutos', hint: 'Relámpago: dos por hora, con recambio' },
  { value: '20', label: '20 minutos', hint: 'Relámpago intenso' },
]

function todayIso(): string {
  // ART = UTC-3 fijo (mismo criterio que artToday en abonado.service.ts).
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

export function TorneoForm({ action }: { action: CreateTournamentAction }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [format, setFormat] = useState('league')
  const [startsOn, setStartsOn] = useState(todayIso())
  const [endsOn, setEndsOn] = useState('')
  const [maxTeams, setMaxTeams] = useState('')
  const [inscriptionFee, setInscriptionFee] = useState('')
  const [matchDuration, setMatchDuration] = useState('60')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const fee = inscriptionFee.trim() === '' ? 0 : Number(inscriptionFee)
    const teams = maxTeams.trim() === '' ? null : Number(maxTeams)
    if (Number.isNaN(fee) || fee < 0) {
      setError('La inscripción tiene que ser un número válido.')
      return
    }
    if (teams !== null && (Number.isNaN(teams) || teams < 2)) {
      setError('El cupo tiene que ser de al menos 2 equipos.')
      return
    }

    startTransition(async () => {
      const result = await action({
        name: name.trim(),
        format,
        startsOn,
        endsOn: endsOn === '' ? null : endsOn,
        maxTeams: teams,
        // El input está en pesos y la DB guarda centavos (regla del repo).
        inscriptionFee: Math.round(fee * 100),
        matchDurationMinutes: Number(matchDuration),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(result.id ? `/torneos/${result.id}` : '/torneos')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="torneo-nombre" className="text-sm font-medium text-foreground">
            Nombre del torneo
          </label>
          <input
            id="torneo-nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="Ej: Clausura 2026"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="torneo-formato" className="text-sm font-medium text-foreground">
            Formato
          </label>
          <Combobox
            id="torneo-formato"
            options={FORMAT_OPTIONS}
            value={format}
            onChange={setFormat}
            listboxLabel="Formato del torneo"
            leadingIcon={<Trophy className="h-4 w-4" aria-hidden="true" />}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="torneo-inicio" className="text-sm font-medium text-foreground">
              Arranca el
            </label>
            <DatePicker id="torneo-inicio" value={startsOn} onChange={setStartsOn} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="torneo-fin" className="text-sm font-medium text-foreground">
              Termina el{' '}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <DatePicker
              id="torneo-fin"
              value={endsOn}
              onChange={setEndsOn}
              min={startsOn}
              placeholder="Sin fecha de cierre"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="torneo-duracion" className="text-sm font-medium text-foreground">
            Duración de cada partido
          </label>
          <Combobox
            id="torneo-duracion"
            options={DURATION_OPTIONS}
            value={matchDuration}
            onChange={setMatchDuration}
            listboxLabel="Duración de cada partido"
            leadingIcon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
          />
          <p className="text-xs text-muted-foreground">
            El torneo reserva horas enteras en la grilla. Con partidos de 30 minutos
            o menos entran dos por hora.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="torneo-cupo" className="text-sm font-medium text-foreground">
              Cupo de equipos{' '}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <div className="relative">
              <Users
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="torneo-cupo"
                type="number"
                inputMode="numeric"
                min={2}
                max={256}
                value={maxTeams}
                onChange={(e) => setMaxTeams(e.target.value)}
                placeholder="Sin límite"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="torneo-inscripcion" className="text-sm font-medium text-foreground">
              Inscripción por equipo
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                aria-hidden="true"
              >
                $
              </span>
              <input
                id="torneo-inscripcion"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={inscriptionFee}
                onChange={(e) => setInscriptionFee(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm tabular-nums outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || name.trim() === ''}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"
        >
          {pending ? 'Creando…' : 'Crear torneo'}
        </button>
        <p className="text-xs text-muted-foreground">
          Después vas a poder tomarle los horarios en la grilla y anotar los equipos.
        </p>
      </div>
    </form>
  )
}
