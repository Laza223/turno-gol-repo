'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft } from 'lucide-react'
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
import { PriceSetup, type CourtPricingSource } from './price-setup/PriceSetup'
import { CourtPhotoPreview } from './CourtPhotoPreview'
import { Button } from '@/components/ui/button'
import { ImageUploader } from '@/components/ui/image-uploader'
import { Input } from '@/components/ui/input'
import { SelectMenu } from '@/components/ui/select-menu'
import { toast } from '@/hooks/use-toast'

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

const MAX_PHOTOS = 6

type StagedPhoto = { blob: Blob; url: string }

type Props = {
  court: CourtRow | null
  /** Complejo dueño del formulario. Llega por prop y no de `court` porque al
   *  crear una cancha `court` es null, y ese —el alta de la primera cancha— es
   *  justo el caso donde más importa saber quién se trabó. */
  tenantId: string
  openingHours: OpeningHours
  closesNextDay: boolean
  /** Otras canchas del complejo, para "Igual que…" (copiar su precio). */
  otherCourts: CourtPricingSource[]
  onSaved: (court: CourtRow) => void
  /** Al editar lleva las fotos actuales: se guardan al elegirlas, aunque después se cancele. */
  onCancel: (photos?: string[]) => void
  /** "Agregar foto" desde la lista abre el editor ya parado en las fotos. */
  initialSection?: 'photos'
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
  initialSection,
  createAction,
  updateAction,
  uploadPhotoAction,
  removePhotoAction,
  reorderPhotosAction,
}: Props) {
  const isEdit = court !== null
  const photosRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (initialSection === 'photos') photosRef.current?.scrollIntoView({ block: 'start' })
  }, [initialSection])
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
  // Alta: la cancha todavía no existe, así que no hay `courtId` al que subir. Las
  // fotos elegidas quedan acá (con un blob: URL para la vista previa) y se suben
  // recién cuando `createAction` devuelve el id.
  const [staged, setStaged] = useState<StagedPhoto[]>([])
  const currentPhotos = isEdit ? photos : staged.map((p) => p.url)
  const stagedRef = useRef(staged)
  stagedRef.current = staged
  useEffect(() => () => stagedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const handleRulesChange = useCallback(
    (nextRules: PricingRule[], meta: { emptyCount: number }) => {
      setRules(nextRules)
      setEmptyCount(meta.emptyCount)
    },
    [],
  )

  async function handlePhotoUpload(blob: Blob) {
    if (!court) {
      setStaged((prev) => [...prev, { blob, url: URL.createObjectURL(blob) }])
      return
    }
    const fd = new FormData()
    fd.set('file', blob, 'photo.webp')
    const result = await uploadPhotoAction(court.id, fd)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  async function handlePhotoRemove(url: string) {
    if (!court) {
      URL.revokeObjectURL(url)
      setStaged((prev) => prev.filter((p) => p.url !== url))
      return
    }
    const result = await removePhotoAction(court.id, url)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  async function handlePhotoReorder(urls: string[]) {
    if (!court) {
      setStaged((prev) => urls.flatMap((u) => prev.filter((p) => p.url === u)))
      return
    }
    const result = await reorderPhotosAction(court.id, urls)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  /**
   * Sube las fotos elegidas en el alta a la cancha recién creada. La cancha ya
   * existe y no se deshace: si una foto falla, se avisa y las demás siguen —
   * se pueden volver a cargar desde "Editar". Devuelve la lista final.
   */
  async function uploadStagedPhotos(courtId: string): Promise<string[]> {
    let uploaded: string[] = []
    let failed = 0
    let lastError = ''
    for (const p of staged) {
      const fd = new FormData()
      fd.set('file', p.blob, 'photo.webp')
      // El fetch de una Server Action rechaza si se cae la red. Con la cancha ya
      // creada eso NO puede escapar de acá: el form quedaría abierto y reenviarlo
      // crearía OTRA cancha (y sumaría otra a la cuota).
      const result = await uploadPhotoAction(courtId, fd).catch(() => null)
      if (result?.success) uploaded = result.photos
      else {
        failed += 1
        lastError = result?.error ?? 'No pudimos subir la imagen. Probá de nuevo en un momento.'
      }
    }
    if (failed > 0) {
      toast({
        title: `La cancha se creó, pero ${failed === 1 ? 'una foto no se subió' : `${failed} fotos no se subieron`}`,
        description: `${lastError} Cargala${failed === 1 ? '' : 's'} desde «Editar».`,
        variant: 'destructive',
      })
    }
    return uploaded
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // Gate client-side (el server valida cobertura igual, de backstop): guardar
    // con huecos dejaría horas operativas sin precio → irreservables online.
    // El auto-relleno (PriceSetup) ya completa las celdas al abrir el editor,
    // así que llegar acá es una cancha nueva sin precio, un precio que se dejó
    // vacío (el de la noche, el de los días distintos) o celdas vaciadas en
    // "Ajustar hora por hora" — antes este corte era mudo, sin ninguna señal
    // de que alguien se había atascado justo acá.
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
        rules.length === 0
          ? 'No se puede guardar: falta el precio del turno.'
          : `No se puede guardar: ${
              emptyCount === 1 ? 'falta 1 hora' : `faltan ${emptyCount} horas`
            } sin precio. Están en ámbar en «Así queda la semana».`,
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
        // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
        // render antes de que `pending` bajara, con los controles todavía deshabilitados.
        startTransition(() => setError(result.error))
        return
      }
      await finishSave(result)
    })
  }

  // Alta: sube las fotos elegidas a la cancha recién creada; edición: no hay nada
  // que subir (cada foto ya se guardó al elegirla).
  async function finishSave(result: { courtId?: string }) {
    const { courtId } = result
    if (!isEdit && courtId && staged.length > 0) {
      notifySaved(result, await uploadStagedPhotos(courtId))
      return
    }
    notifySaved(result)
  }

  // Reload page data by triggering a navigation refresh — parent handles via revalidatePath
  // For now signal parent with a stub row so list updates optimistically
  function notifySaved(result: { courtId?: string }, createdPhotos?: string[]) {
    onSaved({
      ...(court ?? {
        id: result.courtId ?? '',
        tenantId: '',
        createdAt: new Date(),
      }),
      // `photos` (estado) y no `court.photos`: en edición las fotos se guardan al
      // elegirlas, y CourtList no resincroniza con el servidor, así que con la lista
      // vieja "Editar" volvía a abrir con fotos que ya no existen.
      photos: createdPhotos ?? photos,
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
    await finishSave(result)
  }

  const cancel = () => onCancel(isEdit ? photos : undefined)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2">
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Canchas
        </button>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {isEdit ? court.name : 'Nueva cancha'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card shadow-xs">
        <section className="space-y-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground">La cancha</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <label htmlFor="court-name" className="text-sm font-medium text-foreground">
                Nombre
              </label>
              <Input
                id="court-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Cancha 1"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="court-format" className="text-sm font-medium text-foreground">
                Formato
              </label>
              <SelectMenu
                id="court-format"
                name="format"
                value={String(format)}
                onChange={(v) => setFormat(Number(v))}
                options={FORMAT_OPTIONS.map((f) => ({ value: String(f), label: `Fútbol ${f}` }))}
                className="h-11 rounded-lg bg-card md:h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="court-surface" className="text-sm font-medium text-foreground">
                Superficie
              </label>
              <SelectMenu
                id="court-surface"
                name="surfaceType"
                value={surfaceType}
                onChange={setSurfaceType}
                options={SURFACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                className="h-11 rounded-lg bg-card md:h-10"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border p-5 sm:p-6">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-foreground">Precio del turno</h2>
            <p className="text-sm text-muted-foreground">Lo que cobrás por un turno de una hora.</p>
          </div>
          <PriceSetup
            openingHours={openingHours}
            closesNextDay={closesNextDay}
            initialRules={initialRules}
            otherCourts={otherCourts}
            onRulesChange={handleRulesChange}
          />
        </section>

        <section
          ref={photosRef}
          className="scroll-mt-4 space-y-4 border-t border-border p-5 sm:p-6"
        >
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-foreground">Fotos</h2>
            {currentPhotos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin foto, en tu perfil la cancha sale como un fondo verde.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="space-y-2">
              <ImageUploader
                preset="court"
                value={currentPhotos}
                max={MAX_PHOTOS}
                onUpload={handlePhotoUpload}
                onRemove={handlePhotoRemove}
                onReorder={handlePhotoReorder}
                disabled={isPending}
                emptyLabel="Agregar foto"
              />
              <p className="text-xs text-muted-foreground">
                Hasta {MAX_PHOTOS}. La primera es la que se ve en tu perfil.{' '}
                {isEdit ? 'Se guardan apenas las elegís.' : 'Se suben cuando creás la cancha.'}
              </p>
            </div>
            <CourtPhotoPreview
              court={{
                id: court?.id ?? 'preview',
                name: name.trim() || 'Nombre de la cancha',
                surfaceType,
                isCovered: false,
                hasLighting: false,
                format,
                capacity: format * 2,
                fromPriceCents: rules.length > 0 ? Math.min(...rules.map((r) => r.price)) : null,
              }}
              photos={currentPhotos}
            />
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="mx-5 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-red-700 sm:mx-6 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {/* Guardar queda a la vista sin bajar hasta el final. En el teléfono va
            arriba de la barra inferior de navegación (mismo corrimiento que el
            ticket de Vender). */}
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-2 rounded-b-xl border-t border-border bg-card px-5 py-3 lg:bottom-0">
          <Button type="button" variant="ghost" onClick={cancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEdit ? 'Guardar cambios' : 'Crear cancha'}
          </Button>
        </div>

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
    </div>
  )
}
