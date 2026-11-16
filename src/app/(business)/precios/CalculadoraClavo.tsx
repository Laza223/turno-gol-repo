'use client'

import { useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import { Minus, Plus } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { GLASS_INPUT } from '@/components/world/portal-auth-styles'
import { PLANS } from './plans-data'
import './precios.css'

const TURNO_PRESETS = [20000, 25000, 30000, 40000] as const
const WEEKS_PER_MONTH = 4 // conservador: 4 semanas por mes
const MAX_TURNO_ARS = 500000
const MAX_CLAVOS = 10

/**
 * "La cuenta del ausente": el visitante pone SUS números (precio del turno y
 * ausentes por semana) y ve su pérdida mensual contra el precio del plan.
 * La matemática es del cliente — cero claims inventados.
 */
export default function CalculadoraClavo() {
  const [turnoArs, setTurnoArs] = useState<number | null>(30000)
  const [customInput, setCustomInput] = useState<string>('')
  const [clavos, setClavos] = useState<number>(2)

  const perdidaCents = turnoArs === null ? null : turnoArs * 100 * clavos * WEEKS_PER_MONTH
  const desdeCents = PLANS[0]!.priceMonthly

  // Un solo evento por visita y sin montos: alcanza para saber si la usan.
  const trackedRef = useRef(false)
  function markUsed(campo: 'turno' | 'ausentes') {
    if (trackedRef.current) return
    trackedRef.current = true
    track('calculadora_usada', { campo })
  }

  function selectPreset(preset: number) {
    markUsed('turno')
    setTurnoArs(preset)
    setCustomInput('')
  }

  function onTurnoInput(raw: string) {
    markUsed('turno')
    setCustomInput(raw)
    const digits = raw.replace(/\D/g, '')
    if (digits === '') {
      // Campo vacío o solo texto no numérico ("abc"): sin número parseable,
      // no forzar a 0 (leería como "no perdés nada").
      setTurnoArs(null)
      return
    }
    const parsed = Number.parseInt(digits, 10)
    setTurnoArs(Math.min(Number.isNaN(parsed) ? 0 : parsed, MAX_TURNO_ARS))
  }

  return (
    <div className="glass-painted rounded-[32px] p-6 sm:p-10">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        {/* Inputs */}
        <div className="space-y-7">
          <div>
            <label htmlFor="turno-input" className="text-[15px] font-semibold text-portal-slot-ink">
              ¿A cuánto está tu turno?
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {TURNO_PRESETS.map((preset) => {
                const selected = customInput === '' && turnoArs === preset
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    aria-pressed={selected}
                    className={cn(
                      buttonVariants({ variant: 'pill-chip', size: 'pill-sm' }),
                      'tabular-nums',
                    )}
                  >
                    {formatArs(preset * 100)}
                  </button>
                )
              })}
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-semibold text-portal-soft"
                >
                  $
                </span>
                <input
                  id="turno-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={customInput}
                  onChange={(e) => onTurnoInput(e.target.value)}
                  placeholder="Otro"
                  className={cn(
                    GLASS_INPUT,
                    'h-11 w-[130px] rounded-full pr-4 pl-8 text-[15px] font-semibold tabular-nums outline-hidden md:h-11 md:text-[15px]',
                  )}
                />
              </div>
            </div>
          </div>

          <div>
            <span id="clavos-label" className="text-[15px] font-semibold text-portal-slot-ink">
              ¿Cuántos turnos te cuelgan por semana?
            </span>
            <div className="mt-3 inline-flex items-center gap-4 rounded-full border border-portal-inner-line bg-portal-inner p-1.5">
              <button
                type="button"
                onClick={() => {
                  markUsed('ausentes')
                  setClavos((c) => Math.max(0, c - 1))
                }}
                disabled={clavos === 0}
                aria-label="Un turno colgado menos por semana"
                className={cn(buttonVariants({ variant: 'pill-chip', size: 'pill-icon' }))}
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span
                aria-labelledby="clavos-label"
                className="min-w-[2ch] text-center text-2xl font-bold text-portal-ink tabular-nums"
              >
                {clavos}
              </span>
              <button
                type="button"
                onClick={() => {
                  markUsed('ausentes')
                  setClavos((c) => Math.min(MAX_CLAVOS, c + 1))
                }}
                disabled={clavos === MAX_CLAVOS}
                aria-label="Un turno colgado más por semana"
                className={cn(buttonVariants({ variant: 'pill-chip', size: 'pill-icon' }))}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {/* Resultado */}
        <output
          aria-live="polite"
          className="block border-t border-portal-inner-line pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
        >
          {clavos === 0 ? (
            <p className="text-lg leading-relaxed text-portal-ink">
              ¿Ninguno? Bien ahí, sos la excepción.{' '}
              <span className="text-portal-muted">
                TurnoGol igual te ordena la grilla, la caja y el teléfono, desde{' '}
                <span className="font-semibold text-portal-ink">{formatArs(desdeCents)}/mes</span>.
              </span>
            </p>
          ) : perdidaCents === null ? (
            <>
              <div className="text-[15px] font-semibold text-portal-muted">Se te van por mes</div>
              <div className="mt-1 text-[clamp(40px,4.5vw,56px)] leading-none font-bold tracking-[-0.035em] text-portal-soft tabular-nums">
                —
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-portal-muted">
                Ingresá el precio de tu turno para ver cuánto perdés.
              </p>
            </>
          ) : (
            <>
              <div className="text-[15px] font-semibold text-portal-muted">Se te van por mes</div>
              {/* La pérdida cambia por reemplazo (`key`): nunca cuenta de un monto al otro. */}
              <div
                key={perdidaCents}
                className="pr-swap mt-1 text-[clamp(40px,4.5vw,56px)] leading-none font-bold tracking-[-0.035em] text-portal-bad tabular-nums"
              >
                {formatArs(perdidaCents)}
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-portal-muted">
                TurnoGol sale desde{' '}
                <span className="font-semibold text-portal-ink">{formatArs(desdeCents)}/mes</span>
                {perdidaCents > desdeCents ? (
                  <> — menos que lo que te llevan los turnos colgados.</>
                ) : (
                  <>.</>
                )}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed">
                <span className="font-semibold text-portal-slot-ink">
                  El que falta dos veces no reserva online por dos semanas.
                </span>
              </p>
            </>
          )}
        </output>
      </div>
    </div>
  )
}
