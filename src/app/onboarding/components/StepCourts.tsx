'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { parsePesosToCents } from '@/modules/courts/pricing-grid'
import type { CourtRow } from '@/modules/courts/court.types'
import {
  createWizardCourtsAction,
  setWizardStepAction,
  type WizardCourtDraftInput,
} from '../actions'
import { fieldClass, labelClass } from './wizard-styles'

// Mismas opciones que el form de /canchas (consistencia > completitud).
const FORMATS = [4, 5, 6, 7, 8, 9, 10, 11] as const

const SURFACE_OPTIONS = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'tile', label: 'Baldosa' },
] as const

type SurfaceType = (typeof SURFACE_OPTIONS)[number]['value']

type Draft = {
  key: number
  name: string
  format: number
  surfaceType: SurfaceType
  isCovered: boolean
  /** Pesos como texto del input; se convierte a centavos al enviar. */
  price: string
}

type Props = {
  /** Canchas ya creadas (revisita con "Volver"): se listan, no se editan acá. */
  existingCourts: CourtRow[]
}

/** Precio "desde" de una cancha existente para la fila-resumen. */
function minPrice(court: CourtRow): number | null {
  const prices = court.pricing.rules.map((r) => r.price)
  return prices.length ? Math.min(...prices) : null
}

/**
 * Paso 3 — Canchas y precios inline (pages/onboarding.md §5). Un precio por
 * cancha (uniforme sobre los horarios recién confirmados); "+ Agregar otra"
 * duplica la anterior porque el caso real es N canchas iguales. El ajuste por
 * franja (día/noche, finde) vive en /canchas.
 */
export function StepCourts({ existingCourts }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isGoingBack, startBackTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nextKey, setNextKey] = useState(2)
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    existingCourts.length > 0
      ? []
      : [
          {
            key: 1,
            name: 'Cancha 1',
            format: 5,
            surfaceType: 'synthetic_grass',
            isCovered: false,
            price: '',
          },
        ],
  )
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(() => new Set([1]))

  function toggleExpand(key: number) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function updateDraft(key: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function addDraft() {
    const last = drafts.at(-1)
    const n = existingCourts.length + drafts.length + 1
    const newKey = nextKey

    setDrafts((prev) => [
      ...prev,
      {
        key: newKey,
        name: `Cancha ${n}`,
        format: last?.format ?? 5,
        surfaceType: last?.surfaceType ?? 'synthetic_grass',
        isCovered: last?.isCovered ?? false,
        price: last?.price ?? '',
      },
    ])
    // Colapsa las anteriores y expande solo la recién creada para mantener la vista limpia.
    setExpandedKeys(new Set([newKey]))
    setNextKey((k) => k + 1)
  }

  function removeDraft(key: number) {
    setDrafts((prev) => prev.filter((d) => d.key !== key))
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const courts: WizardCourtDraftInput[] = []
    for (const d of drafts) {
      if (d.name.trim().length === 0) {
        setError('Poné un nombre a cada cancha.')
        setExpandedKeys((prev) => new Set(prev).add(d.key))
        return
      }
      const priceCents = parsePesosToCents(d.price)
      if (priceCents == null || priceCents <= 0) {
        setError(`Cargá el precio por turno de ${d.name.trim() || 'cada cancha'}.`)
        setExpandedKeys((prev) => new Set(prev).add(d.key))
        return
      }
      courts.push({
        name: d.name.trim(),
        format: d.format,
        surfaceType: d.surfaceType,
        isCovered: d.isCovered,
        priceCents,
      })
    }

    startTransition(async () => {
      const result = await createWizardCourtsAction({ courts })
      if (!result.success) setError(result.error)
    })
  }

  function handleBack() {
    setError(null)
    startBackTransition(async () => {
      const result = await setWizardStepAction(1)
      if (!result.success) setError(result.error)
    })
  }

  const canRemove = drafts.length > 1 || existingCourts.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Tus canchas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Con una cancha y su precio ya podés recibir reservas online.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {existingCourts.length > 0 && (
          <div className="space-y-2">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {existingCourts.map((court) => {
                const price = minPrice(court)
                return (
                  <li key={court.id} className="flex items-center gap-3 px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {court.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Fútbol {court.format}
                      {price != null && <> · {formatArs(price)}</>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Estas ya están creadas — las editás después desde Canchas.
            </p>
          </div>
        )}

        {drafts.map((draft, i) => {
          const isExpanded = expandedKeys.has(draft.key)
          const surfaceLabel =
            SURFACE_OPTIONS.find((s) => s.value === draft.surfaceType)?.label ?? draft.surfaceType

          return (
            <fieldset
              key={draft.key}
              className="rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-200"
            >
              <legend className="sr-only">{draft.name || `Cancha ${i + 1}`}</legend>

              {/* Cabecera / Fila resumen con animación de icono */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(draft.key)}
                  className="group flex flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-transform duration-200" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-transform duration-200" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {draft.name || 'Cancha sin nombre'}
                      </span>
                      {!isExpanded && (
                        draft.price ? (
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                            $ {draft.price}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-500 dark:text-red-400">
                            (falta precio)
                          </span>
                        )
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        Fútbol {draft.format} · {surfaceLabel}
                        {draft.isCovered ? ' · Techada' : ''}
                      </p>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => toggleExpand(draft.key)}
                  >
                    {isExpanded ? (
                      'Listo'
                    ) : (
                      <>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Editar
                      </>
                    )}
                  </Button>
                  {canRemove && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                          aria-label={`Quitar ${draft.name || 'cancha'}`}
                          onClick={() => removeDraft(draft.key)}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Quitar cancha</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Contenedor del formulario con animación fluida de expansión/colapso */}
              <div
                className={cn(
                  'grid transition-all duration-200 ease-out overflow-hidden',
                  isExpanded
                    ? 'grid-rows-[1fr] opacity-100 mt-4 border-t border-border/60 pt-4'
                    : 'grid-rows-[0fr] opacity-0 mt-0 pt-0'
                )}
              >
                <div className="min-h-0 space-y-4">
                  <div>
                    <label htmlFor={`court-name-${draft.key}`} className={labelClass}>
                      Nombre <span className="text-red-500 dark:text-red-400">*</span>
                    </label>
                    <input
                      id={`court-name-${draft.key}`}
                      value={draft.name}
                      onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                      placeholder="Ej: Cancha 1"
                      required
                      className={fieldClass}
                    />
                  </div>

                  {/* Formato en chips (Hick: 5 opciones, las mismas que /canchas). */}
                  <fieldset>
                    <legend className={labelClass}>Formato</legend>
                    <div className="flex flex-wrap gap-2">
                      {FORMATS.map((f) => {
                        const active = draft.format === f
                        return (
                          <label
                            key={f}
                            className={
                              active
                                ? 'cursor-pointer rounded-full border border-emerald-600 bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
                                : 'cursor-pointer rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground hover:border-emerald-600/40 hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
                            }
                          >
                            <input
                              type="radio"
                              name={`format-${draft.key}`}
                              value={f}
                              checked={active}
                              onChange={() => updateDraft(draft.key, { format: f })}
                              className="sr-only"
                            />
                            Fútbol {f}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`court-surface-${draft.key}`} className={labelClass}>
                        Superficie
                      </label>
                      <select
                        id={`court-surface-${draft.key}`}
                        value={draft.surfaceType}
                        onChange={(e) =>
                          updateDraft(draft.key, { surfaceType: e.target.value as SurfaceType })
                        }
                        className={fieldClass}
                      >
                        {SURFACE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`court-price-${draft.key}`} className={labelClass}>
                        Precio por turno <span className="text-red-500 dark:text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground"
                        >
                          $
                        </span>
                        <input
                          id={`court-price-${draft.key}`}
                          inputMode="numeric"
                          value={draft.price}
                          onChange={(e) => updateDraft(draft.key, { price: e.target.value })}
                          placeholder="Ej: 20.000"
                          required
                          className={`${fieldClass} pl-7`}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Por turno de 1 hora, igual toda la semana. Después podés poner
                        precio por franja desde Canchas.
                      </p>
                    </div>
                  </div>

                  <label className="flex w-fit cursor-pointer select-none items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.isCovered}
                      onChange={(e) => updateDraft(draft.key, { isCovered: e.target.checked })}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="text-sm text-foreground">Techada</span>
                  </label>
                </div>
              </div>
            </fieldset>
          )
        })}

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed hover:border-emerald-600/50 hover:text-emerald-700 dark:hover:text-emerald-400"
          onClick={addDraft}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Agregar otra cancha
        </Button>
        {drafts.length > 1 && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Copiamos los datos de la anterior — cambiá solo lo distinto.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            isLoading={isGoingBack}
            disabled={isPending}
          >
            Volver
          </Button>
          <Button type="submit" isLoading={isPending} disabled={isGoingBack} className="flex-1">
            Continuar
          </Button>
        </div>
      </form>
    </div>
  )
}
