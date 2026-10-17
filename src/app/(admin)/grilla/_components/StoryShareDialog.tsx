'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Download, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import { computeArtNow } from '@/hooks/use-art-now'
import { addDays } from '@/lib/booking/grid-cells'
import { buildPublicLinkUrl, cn } from '@/lib/utils'
import { rejectionMessage } from '@/shared/lib/rejection-message'
import type { ActionResult } from '@/shared/types/action-result'

export type StoryExportMethod = 'share' | 'download' | 'link'

/** Firma de `trackStoryExportAction`: llega por prop, no por import de valor. */
export type TrackStoryExport = (input: {
  method: StoryExportMethod
  daysAhead: number
}) => Promise<ActionResult>

type Props = {
  slug: string
  /** `booking_advance_days` del complejo: hasta ahí llega la placa. */
  bookingAdvanceDays: number
  trackAction: TrackStoryExport
  onClose: () => void
}

type Loaded =
  | { key: string; ok: true; url: string; file: File; canShare: boolean }
  | { key: string; ok: false; message: string; retryable: boolean }

// Una historia se arma para hoy o para los próximos días: con ventanas de reserva
// largas (hasta 31 días) la fila de chips se volvería una regla.
const MAX_DAYS_AHEAD = 6

const TIME_ZONE = 'America/Argentina/Buenos_Aires'

function dayChipLabel(daysAhead: number, date: string): string {
  if (daysAhead === 0) return 'Hoy'
  if (daysAhead === 1) return 'Mañana'
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    timeZone: TIME_ZONE,
  })
}

// Compartir el archivo solo es lo natural en el celular (menú del sistema →
// Instagram / WhatsApp). En escritorio el share sheet estorba: ahí se descarga.
// Se evalúa cuando llega la imagen (dentro del efecto), nunca durante el render.
function canShareFile(file: File): boolean {
  return (
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    (window.matchMedia?.('(pointer: coarse)').matches ?? false) &&
    navigator.canShare({ files: [file] })
  )
}

/**
 * La placa de turnos libres para subir a una historia de Instagram o a un estado
 * de WhatsApp. La imagen la dibuja `/api/public/story`; acá se elige el día, se
 * ve la vista previa y se comparte o descarga.
 *
 * El enlace que la placa dibuja no se puede tocar: por eso el diálogo ofrece
 * copiarlo aparte, para pegarlo en el sticker "Link" de la historia o en el
 * mensaje.
 */
export function StoryShareDialog({ slug, bookingAdvanceDays, trackAction, onClose }: Props) {
  // Se fija al abrir: la Grilla arma este diálogo recién al tocar el botón.
  const [today] = useState(() => computeArtNow().date)
  const [daysAhead, setDaysAhead] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const dayCount = Math.min(bookingAdvanceDays, MAX_DAYS_AHEAD) + 1
  const days = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(today, i)
    return { value: String(i), label: dayChipLabel(i, date) }
  })
  const date = addDays(today, daysAhead)
  const key = `${date}:${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null

    fetch(`/api/public/story?slug=${encodeURIComponent(slug)}&date=${date}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const message =
            res.status === 429
              ? 'Pediste muchas placas seguidas. Probá de nuevo en un minuto.'
              : await rejectionMessage(res, 'No se pudo generar la imagen. Probá de nuevo.')
          if (controller.signal.aborted) return
          // Un 4xx (sin turnos libres, día cerrado…) no se arregla reintentando: se cambia de día.
          setLoaded({ key, ok: false, message, retryable: res.status >= 500 || res.status === 429 })
          return
        }
        const blob = await res.blob()
        // Si el dueño ya cambió de día, esta respuesta es de otra placa: crear la
        // URL ahora dejaría un blob que el cleanup (que ya corrió) no revoca.
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        const file = new File([blob], `turnos-${slug}-${date}.png`, { type: 'image/png' })
        setLoaded({ key, ok: true, url: objectUrl, file, canShare: canShareFile(file) })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setLoaded({
          key,
          ok: false,
          message: 'No hay conexión. Revisá tu internet y probá de nuevo.',
          retryable: true,
        })
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [slug, date, key])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  // El resultado de otro día (o de un intento anterior) no se muestra: mientras
  // no llegue el de `key`, el diálogo está cargando.
  const current = loaded?.key === key ? loaded : null
  const image = current?.ok ? current : null
  const failure = current && !current.ok ? current : null

  const canShare = image?.canShare ?? false

  // Best-effort: la imagen ya salió, si la medición falla el dueño no se entera.
  function track(method: StoryExportMethod) {
    void trackAction({ method, daysAhead }).catch(() => {})
  }

  // `navigator.share` tiene que arrancar dentro del gesto del toque: por eso el
  // archivo se descarga por adelantado y acá no hay ningún `await` antes.
  async function share() {
    if (!image) return
    setShareError(null)
    try {
      await navigator.share({ files: [image.file] })
      track('share')
    } catch (err) {
      // Cerrar el menú de compartir sin elegir nada no es un error.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setShareError(
        'No se pudo abrir el menú de compartir. Descargá la imagen y subila desde tu galería.',
      )
    }
  }

  function download() {
    if (!image) return
    const a = document.createElement('a')
    a.href = image.url
    a.download = image.file.name
    a.click()
    track('download')
  }

  async function copyLink() {
    const link = buildPublicLinkUrl(process.env.NEXT_PUBLIC_APP_URL, window.location.origin, slug)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Safari privado, contexto sin HTTPS: el prompt deja copiarlo a mano.
      window.prompt('Copiá el link:', link)
    }
    track('link')
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Turnos libres para tu historia</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Una imagen lista para Instagram o el estado de WhatsApp, con los turnos que quedan
            libres.
          </p>
        </DialogHeader>

        {days.length > 1 && (
          <SegmentedControl
            aria-label="Día de la placa"
            className="flex gap-2 overflow-x-auto py-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
            value={String(daysAhead)}
            onValueChange={(v) => {
              setDaysAhead(Number(v))
              setShareError(null)
            }}
            options={days}
            itemClassName={(active) =>
              cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-semibold capitalize transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )
            }
          />
        )}

        <div
          aria-live="polite"
          className="mx-auto flex aspect-[9/16] h-[min(46dvh,26rem)] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted"
        >
          {image ? (
            // Blob local: next/image no aplica.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={`Placa de turnos libres: ${dayChipLabel(daysAhead, date).toLowerCase()}`}
              className="h-full w-full object-contain"
            />
          ) : failure ? (
            <div className="space-y-3 p-4 text-center">
              <p className="text-sm text-foreground">{failure.message}</p>
              {failure.retryable && (
                <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  Reintentar
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <TgBallSpinner size="sm" aria-hidden="true" />
              Armando la placa…
            </div>
          )}
        </div>

        <div className="space-y-2">
          {canShare ? (
            <Button className="w-full" onClick={share}>
              <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Compartir imagen
            </Button>
          ) : (
            <Button className="w-full" onClick={download} disabled={!image}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Descargar imagen
            </Button>
          )}
          <div className={cn('grid gap-2', canShare ? 'grid-cols-2' : 'grid-cols-1')}>
            {canShare && (
              <Button variant="outline" onClick={download}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Descargar
              </Button>
            )}
            <Button variant="outline" onClick={copyLink}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {copied ? '¡Copiado!' : 'Copiar link'}
            </Button>
          </div>
          {shareError && (
            <p role="alert" className="text-sm text-destructive">
              {shareError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            El link de la imagen no se puede tocar. En Instagram, copialo y pegalo en el sticker
            &quot;Link&quot; de tu historia; en WhatsApp, pegalo en el mensaje.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
