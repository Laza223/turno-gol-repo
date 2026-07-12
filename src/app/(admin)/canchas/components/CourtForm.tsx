'use client'

import { useCallback, useState, useTransition } from 'react'
import type { CourtRow, PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import {
  countEmptyCells,
  expandRulesToGrid,
} from '@/modules/courts/pricing-grid'
import type { CourtActionResult, CourtPhotoActionResult } from '../actions'
import { PricingSection, type CourtPricingSource } from './PricingSection'
import { Button } from '@/components/ui/button'
import { ImageUploader } from '@/components/ui/image-uploader'

/**
 * Las 5 Server Actions llegan por PROP, no por import: '../actions' es
 * `'use server'` y arrastra drizzle/postgres → `node:async_hooks`, que rompe
 * cualquier bundle de browser (Storybook). Ver el comentario en
 * ReservasPolicyForm.tsx.
 */
export type CreateCourtAction = (formData: FormData) => Promise<CourtActionResult>
export type UpdateCourtAction = (courtId: string, formData: FormData) => Promise<CourtActionResult>
export type UploadCourtPhotoAction = (
  courtId: string,
  formData: FormData,
) => Promise<CourtPhotoActionResult>
export type RemoveCourtPhotoAction = (courtId: string, url: string) => Promise<CourtPhotoActionResult>
export type ReorderCourtPhotosAction = (
  courtId: string,
  urls: string[],
) => Promise<CourtPhotoActionResult>

const SURFACE_OPTIONS = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'tile', label: 'Baldosa' },
] as const

const FORMAT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11] as const

type Props = {
  court: CourtRow | null
  openingHours: OpeningHours
  /** Otras canchas del complejo, para "Copiar precios de otra cancha". */
  otherCourts: CourtPricingSource[]
  onSaved: (court: CourtRow) => void
  onCancel: () => void
  createAction: CreateCourtAction
  updateAction: UpdateCourtAction
  uploadPhotoAction: UploadCourtPhotoAction
  removePhotoAction: RemoveCourtPhotoAction
  reorderPhotosAction: ReorderCourtPhotosAction
}

export function CourtForm({
  court,
  openingHours,
  otherCourts,
  onSaved,
  onCancel,
  createAction,
  updateAction,
  uploadPhotoAction,
  removePhotoAction,
  reorderPhotosAction,
}: Props) {
  const isEdit = court !== null
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(court?.name ?? '')
  const [surfaceType, setSurfaceType] = useState<string>(court?.surfaceType ?? 'synthetic_grass')
  const [format, setFormat] = useState<number>(court?.format ?? 5)
  // Cancha nueva arranca SIN precios (spec §3.3): los DEFAULT_RULES con precios
  // inventados podían irse a producción sin que nadie los tocara.
  const initialRules = court?.pricing.rules ?? []
  const [rules, setRules] = useState<PricingRule[]>(initialRules)
  const [emptyCount, setEmptyCount] = useState<number>(() =>
    countEmptyCells(expandRulesToGrid(initialRules, openingHours), openingHours),
  )

  const [photos, setPhotos] = useState<string[]>(court?.photos ?? [])

  const handleRulesChange = useCallback(
    (nextRules: PricingRule[], meta: { emptyCount: number }) => {
      setRules(nextRules)
      setEmptyCount(meta.emptyCount)
    },
    [],
  )

  async function handlePhotoUpload(blob: Blob) {
    if (!court) return
    const fd = new FormData()
    fd.set('file', blob, 'photo.webp')
    const result = await uploadPhotoAction(court.id, fd)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  async function handlePhotoRemove(url: string) {
    if (!court) return
    const result = await removePhotoAction(court.id, url)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  async function handlePhotoReorder(urls: string[]) {
    if (!court) return
    const result = await reorderPhotosAction(court.id, urls)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // Gate client-side (el server valida cobertura igual, de backstop): guardar
    // con huecos dejaría horas operativas sin precio → irreservables online.
    if (emptyCount > 0) {
      setError(
        `No se puede guardar: falta${emptyCount === 1 ? '' : 'n'} ${emptyCount} horario${
          emptyCount === 1 ? '' : 's'
        } sin precio. Cargalo${emptyCount === 1 ? '' : 's'} con la plantilla o con «Ajustar por hora».`,
      )
      return
    }
    const formData = new FormData(e.currentTarget)
    formData.set('pricing', JSON.stringify({ rules }))

    startTransition(async () => {
      const result = isEdit
        ? await updateAction(court.id, formData)
        : await createAction(formData)

      if (!result.success) {
        setError(result.error)
        return
      }
      // Reload page data by triggering a navigation refresh — parent handles via revalidatePath
      // For now signal parent with a stub row so list updates optimistically
      onSaved({
        ...(court ?? {
          id: result.courtId ?? '',
          tenantId: '',
          photos: [],
          createdAt: new Date(),
        }),
        name,
        surfaceType,
        format,
        capacity: format * 2,
        status: court?.status ?? 'online',
        description: court?.description ?? null,
        pricing: { rules },
        updatedAt: new Date(),
      } as CourtRow)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {isEdit ? 'Editar cancha' : 'Nueva cancha'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="court-name" className="block text-sm font-medium mb-1">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            id="court-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Cancha 1"
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="court-surface" className="block text-sm font-medium mb-1">
            Superficie <span className="text-red-500">*</span>
          </label>
          <select
            id="court-surface"
            name="surfaceType"
            value={surfaceType}
            onChange={(e) => setSurfaceType(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {SURFACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="court-format" className="block text-sm font-medium mb-1">
            Formato <span className="text-red-500">*</span>
          </label>
          <select
            id="court-format"
            name="format"
            value={format}
            onChange={(e) => setFormat(Number(e.target.value))}
            className="w-full border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                Fútbol {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Precios: plantilla rápida + resumen + ajuste fino (spec §3) */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Precios</h3>
          <p className="text-xs text-muted-foreground">
            Los precios se ingresan en pesos, por turno de una hora.
          </p>
        </div>

        <PricingSection
          openingHours={openingHours}
          initialRules={initialRules}
          otherCourts={otherCourts}
          onRulesChange={handleRulesChange}
        />
      </div>

      {isEdit && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fotos</h3>
            <p className="text-xs text-muted-foreground">
              La primera foto es la que se ve en la card de la cancha. Hasta 6.
            </p>
          </div>
          <ImageUploader
            preset="court"
            value={photos}
            max={6}
            onUpload={handlePhotoUpload}
            onRemove={handlePhotoRemove}
            onReorder={handlePhotoReorder}
            emptyLabel="Agregar foto"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button
        type="submit"
        isLoading={isPending}
        className="w-full h-11"
      >
        {isEdit ? 'Guardar cambios' : 'Crear cancha'}
      </Button>
    </form>
  )
}
