'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import type { ActionResult } from '@/shared/types/action-result'
import type { CourtRow, PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { countEmptyCells, expandRulesToGrid } from '@/modules/courts/pricing-grid'
import * as Sentry from '@sentry/nextjs'
import { track } from '@/shared/observability/breadcrumbs'
import type { CourtActionResult, CourtPhotoActionResult } from '../actions'
import {
  billingChangeMessage,
  billingChangeTitle,
  type BillingChangePreview,
} from '../billing-copy'
import { PricingSection, type CourtPricingSource } from './PricingSection'
import { Button } from '@/components/ui/button'
import { ImageUploader } from '@/components/ui/image-uploader'
import { SelectMenu } from '@/components/ui/select-menu'

/**
 * Las 5 Server Actions llegan por PROP, no por import: '../actions' es
 * `'use server'` y arrastra drizzle/postgres → `node:async_hooks`, que rompe
 * cualquier bundle de browser (Storybook). Ver el comentario en
 * ReservasPolicyForm.tsx.
 *
 * `confirmBillingChange` es el segundo paso del aviso de cuota: la primera
 * llamada vuelve con `requiresBillingConfirmation` y sin crear nada, y recién
 * la segunda —con el dueño ya informado del monto nuevo— ejecuta.
 */
export type CreateCourtAction = (
  formData: FormData,
  confirmBillingChange?: boolean,
) => Promise<CourtActionResult>
export type UpdateCourtAction = (courtId: string, formData: FormData) => Promise<CourtActionResult>
export type UploadCourtPhotoAction = (
  courtId: string,
  formData: FormData,
) => Promise<CourtPhotoActionResult>
export type RemoveCourtPhotoAction = (
  courtId: string,
  url: string,
) => Promise<CourtPhotoActionResult>
export type ReorderCourtPhotosAction = (
  courtId: string,
  urls: string[],
) => Promise<CourtPhotoActionResult>

// Mismo criterio que CourtList: el Radix Dialog solo pesa cuando el aviso de
// cuota aparece de verdad, que es la excepción y no el alta normal.
const ConfirmDialog = dynamic(
  () => import('@/components/ui/confirm-dialog').then((m) => m.ConfirmDialog),
  { ssr: false },
)

const SURFACE_OPTIONS = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'tile', label: 'Baldosa' },
] as const

const FORMAT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11] as const

type Props = {
  court: CourtRow | null
  /** Complejo dueño del formulario. Llega por prop y no de `court` porque al
   *  crear una cancha `court` es null, y ese —el alta de la primera cancha— es
   *  justo el caso donde más importa saber quién se trabó. */
  tenantId: string
  openingHours: OpeningHours
  closesNextDay: boolean
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
  tenantId,
  openingHours,
  closesNextDay,
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
  // Aviso de "esta cancha te sube la cuota". El FormData del intento frenado se
  // guarda tal cual para reenviarlo idéntico al confirmar: rearmarlo desde el
  // estado abriría la puerta a que se confirme un monto y se guarde otra cosa.
  const [billingPreview, setBillingPreview] = useState<BillingChangePreview | null>(null)
  const pendingFormData = useRef<FormData | null>(null)

  const [name, setName] = useState(court?.name ?? '')
  const [surfaceType, setSurfaceType] = useState<string>(court?.surfaceType ?? 'synthetic_grass')
  const [format, setFormat] = useState<number>(court?.format ?? 5)
  // Cancha nueva arranca SIN precios (spec §3.3): los DEFAULT_RULES con precios
  // inventados podían irse a producción sin que nadie los tocara.
  const initialRules = court?.pricing.rules ?? []
  const [rules, setRules] = useState<PricingRule[]>(initialRules)
  const [emptyCount, setEmptyCount] = useState<number>(() =>
    countEmptyCells(
      expandRulesToGrid(initialRules, openingHours, closesNextDay),
      openingHours,
      closesNextDay,
    ),
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
    // El auto-relleno (PricingSection) ya completa las celdas al abrir el
    // editor, así que llegar acá significa que la persona las vació a mano
    // después (ej. "Ajustar por hora" → borrar selección) — antes este corte
    // era mudo, sin ninguna señal de que alguien se había atascado justo acá.
    if (emptyCount > 0) {
      track.courts('courts.pricing_save_blocked', { tenantId, emptyCount })
      // `track` en el navegador deja SOLO un breadcrumb: el sink durable de
      // analytics se registra desde instrumentation.ts y run-workers.ts, los dos
      // en el server, así que acá no hay dónde persistirlo y un breadcrumb sin
      // excepción posterior no llega a ningún lado. Este corte es justo el que
      // dejó a un complejo trabado una semana sin que nos enteráramos, así que
      // además se emite un evento propio con el SDK del navegador.
      Sentry.captureMessage('courts.pricing_save_blocked', {
        level: 'warning',
        tags: { tenantId },
        extra: { emptyCount },
      })
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
      const result = isEdit ? await updateAction(court.id, formData) : await createAction(formData)

      if (!result.success) {
        if (result.requiresBillingConfirmation) {
          // No es un error: la cancha no se creó todavía porque sube la cuota y
          // el dueño tiene que ver el monto nuevo antes.
          pendingFormData.current = formData
          setBillingPreview(result.requiresBillingConfirmation)
          return
        }
        setError(result.error)
        return
      }
      notifySaved(result)
    })
  }

  // Reload page data by triggering a navigation refresh — parent handles via revalidatePath
  // For now signal parent with a stub row so list updates optimistically
  function notifySaved(result: { courtId?: string }) {
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
  }

  async function confirmBillingChange(): Promise<ActionResult | void> {
    const formData = pendingFormData.current
    if (!formData) return { success: false, error: 'Volvé a enviar el formulario.' }
    const result = await createAction(formData, true)
    if (!result.success) return { success: false, error: result.error }
    pendingFormData.current = null
    notifySaved(result)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-lg border border-border shadow-xs p-6 space-y-6"
    >
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
            className="h-12 w-full rounded-xl border border-border bg-background px-3.5 text-base md:text-sm text-foreground shadow-xs transition-colors focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="court-surface" className="block text-sm font-medium mb-1">
            Superficie <span className="text-red-500">*</span>
          </label>
          <SelectMenu
            id="court-surface"
            name="surfaceType"
            value={surfaceType}
            onChange={setSurfaceType}
            options={SURFACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>

        <div>
          <label htmlFor="court-format" className="block text-sm font-medium mb-1">
            Formato <span className="text-red-500">*</span>
          </label>
          <SelectMenu
            id="court-format"
            name="format"
            value={String(format)}
            onChange={(v) => setFormat(Number(v))}
            options={FORMAT_OPTIONS.map((f) => ({ value: String(f), label: `Fútbol ${f}` }))}
          />
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
          closesNextDay={closesNextDay}
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

      <Button type="submit" isLoading={isPending} className="w-full h-11">
        {isEdit ? 'Guardar cambios' : 'Crear cancha'}
      </Button>

      {billingPreview && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setBillingPreview(null)
              pendingFormData.current = null
            }
          }}
          title={billingChangeTitle(billingPreview)}
          description={<p>{billingChangeMessage(billingPreview)}</p>}
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          onConfirm={confirmBillingChange}
        />
      )}
    </form>
  )
}
