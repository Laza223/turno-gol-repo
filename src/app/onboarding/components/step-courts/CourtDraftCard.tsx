'use client'

import { ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ImageUploader } from '@/components/ui/image-uploader'
import { cn } from '@/lib/utils'
import { fieldClass, labelClass } from '../wizard-styles'
import { FORMATS, SURFACE_OPTIONS, type Draft, type SurfaceType } from './constants'
import {
  uploadOnboardingCourtPhotoAction,
  deleteOnboardingCourtPhotoAction,
} from '../../actions'

type Props = {
  draft: Draft
  index: number
  isExpanded: boolean
  canRemove: boolean
  onToggle: (key: number) => void
  onUpdate: (key: number, patch: Partial<Draft>) => void
  onRemove: (key: number) => void
}

/** Tarjeta de un borrador de cancha: fila-resumen colapsable + form inline. */
export function CourtDraftCard({
  draft,
  index,
  isExpanded,
  canRemove,
  onToggle,
  onUpdate,
  onRemove,
}: Props) {
  const surfaceLabel =
    SURFACE_OPTIONS.find((s) => s.value === draft.surfaceType)?.label ?? draft.surfaceType

  return (
    <fieldset className="rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-200">
      <legend className="sr-only">{draft.name || `Cancha ${index + 1}`}</legend>

      {/* Cabecera / Fila resumen con animación de icono */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onToggle(draft.key)}
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
            className="h-11 md:h-9 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onToggle(draft.key)}
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
                  className="h-11 w-11 md:h-9 md:w-9 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  aria-label={`Quitar ${draft.name || 'cancha'}`}
                  onClick={() => onRemove(draft.key)}
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
              onChange={(e) => onUpdate(draft.key, { name: e.target.value })}
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
                        ? 'cursor-pointer inline-flex items-center justify-center rounded-full border border-emerald-600 bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 min-h-11 md:min-h-9 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
                        : 'cursor-pointer inline-flex items-center justify-center rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground hover:border-emerald-600/40 hover:text-foreground min-h-11 md:min-h-9 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
                    }
                  >
                    <input
                      type="radio"
                      name={`format-${draft.key}`}
                      value={f}
                      checked={active}
                      onChange={() => onUpdate(draft.key, { format: f })}
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
                onChange={(e) => onUpdate(draft.key, { surfaceType: e.target.value as SurfaceType })}
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
                  onChange={(e) => onUpdate(draft.key, { price: e.target.value })}
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
              onChange={(e) => onUpdate(draft.key, { isCovered: e.target.checked })}
              className="h-4 w-4 accent-emerald-600"
            />
            <span className="text-sm text-foreground">Techada</span>
          </label>

          <div className="border-t border-border/40 pt-4">
            <label className={cn(labelClass, 'mb-1 flex items-baseline gap-1.5')}>
              Foto de la cancha
              <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </label>
            <p className="mb-3 text-xs text-muted-foreground">
              Subí una foto para que los jugadores puedan identificar visualmente esta cancha al reservar.
            </p>
            <ImageUploader
              preset="court"
              value={draft.photos}
              onUpload={async (blob) => {
                const fd = new FormData()
                fd.append('file', blob)
                const res = await uploadOnboardingCourtPhotoAction(fd)
                if (res.success) {
                  onUpdate(draft.key, { photos: [...draft.photos, res.url] })
                } else {
                  alert(res.error)
                }
              }}
              onRemove={async (url) => {
                const res = await deleteOnboardingCourtPhotoAction(url)
                if (res.success) {
                  onUpdate(draft.key, { photos: draft.photos.filter((p) => p !== url) })
                } else {
                  alert(res.error)
                }
              }}
              max={1}
              emptyLabel="Subir foto"
            />
          </div>
        </div>
      </div>
    </fieldset>
  )
}
