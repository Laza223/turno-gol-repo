'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { PLANS } from './plans-data'

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
  const [turnoArs, setTurnoArs] = useState<number>(30000)
  const [customInput, setCustomInput] = useState<string>('')
  const [clavos, setClavos] = useState<number>(2)

  const perdidaCents = turnoArs * 100 * clavos * WEEKS_PER_MONTH
  const desdeCents = PLANS[0]!.priceMonthly

  function selectPreset(preset: number) {
    setTurnoArs(preset)
    setCustomInput('')
  }

  function onTurnoInput(raw: string) {
    setCustomInput(raw)
    const digits = raw.replace(/\D/g, '')
    const parsed = digits === '' ? 0 : Number.parseInt(digits, 10)
    setTurnoArs(Math.min(Number.isNaN(parsed) ? 0 : parsed, MAX_TURNO_ARS))
  }

  return (
    <div
      className="relative overflow-hidden border border-white/10 p-7 sm:p-10"
      style={{
        borderRadius: '24px',
        background: 'linear-gradient(180deg, rgba(15,23,42,.78), rgba(2,6,23,.9))',
        boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -40px rgba(0,0,0,.9)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-20%] top-[-40%] h-[420px] w-[420px] rounded-full blur-[10px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.14), transparent 70%)' }}
      />
      <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        {/* Inputs */}
        <div className="space-y-7">
          <div>
            <label htmlFor="turno-input" className="font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
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
                    className={`h-11 rounded-full px-4 text-sm font-semibold tabular-nums transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                      selected
                        ? 'bg-emerald-500 text-slate-950'
                        : 'border border-white/10 bg-white/4 text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    {formatArs(preset * 100)}
                  </button>
                )
              })}
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
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
                  className="h-11 w-[110px] rounded-full border border-white/10 bg-white/4 pl-8 pr-4 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                />
              </div>
            </div>
          </div>

          <div>
            <span id="clavos-label" className="font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
              ¿Cuántos te cuelgan por semana?
            </span>
            <div className="mt-3 inline-flex items-center gap-4 rounded-full border border-white/10 bg-white/4 p-1.5">
              <button
                type="button"
                onClick={() => setClavos((c) => Math.max(0, c - 1))}
                disabled={clavos === 0}
                aria-label="Un ausente menos por semana"
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-35 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span
                aria-labelledby="clavos-label"
                className="min-w-[2ch] text-center font-display text-2xl font-bold tabular-nums text-white"
              >
                {clavos}
              </span>
              <button
                type="button"
                onClick={() => setClavos((c) => Math.min(MAX_CLAVOS, c + 1))}
                disabled={clavos === MAX_CLAVOS}
                aria-label="Un ausente más por semana"
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-35 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {/* Resultado */}
        <output aria-live="polite" className="block border-t border-white/10 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          {clavos === 0 ? (
            <p className="text-lg leading-relaxed text-slate-300">
              ¿Cero ausentes? Enhorabuena — sos la excepción.{' '}
              <span className="text-slate-400">
                TurnoGol igual te ordena la grilla, la caja y el teléfono, desde{' '}
                <span className="font-semibold text-white">{formatArs(desdeCents)}/mes</span>.
              </span>
            </p>
          ) : (
            <>
              <div className="font-logo text-[12px] font-bold uppercase tracking-widest text-slate-500">
                Se te van por mes
              </div>
              <div
                className="mt-1 font-display font-black tabular-nums text-red-400"
                style={{ fontSize: 'clamp(40px, 4.5vw, 56px)', letterSpacing: '-0.02em', lineHeight: 1 }}
              >
                {formatArs(perdidaCents)}
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
                TurnoGol sale desde <span className="font-semibold text-white">{formatArs(desdeCents)}/mes</span>
                {perdidaCents > desdeCents ? (
                  <> — menos que lo que te llevan los turnos colgados.</>
                ) : (
                  <>.</>
                )}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
                Con la seña, el turno colgado lo paga el que no vino.{' '}
                <span className="font-semibold text-[#6ee7b7]">No vos.</span>
              </p>
            </>
          )}
        </output>
      </div>
    </div>
  )
}
