'use client'

import { useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { Share2, X } from 'lucide-react'
import type { TrackStoryExport } from '@/app/(admin)/grilla/_components/StoryShareDialog'

// No suma peso a Hoy hasta el toque: el diálogo trae su propio render de la placa.
const StoryShareDialog = dynamic(
  () => import('@/app/(admin)/grilla/_components/StoryShareDialog').then((m) => m.StoryShareDialog),
  { ssr: false },
)

// Por complejo: quien maneja dos (o impersona) cierra uno sin esconder el del otro.
const closedKey = (slug: string) => `tg:share-schedule-fab-closed:${slug}`

function readClosedDay(slug: string): string | null {
  try {
    return window.localStorage.getItem(closedKey(slug))
  } catch {
    return null
  }
}

function writeClosedDay(slug: string, day: string): void {
  try {
    window.localStorage.setItem(closedKey(slug), day)
  } catch {
    // Sin storage (modo privado, bloqueado): se cierra por esta visita y listo.
  }
}

const noSubscription = () => () => {}

/**
 * Acceso flotante a la placa de horarios libres, para que el complejo la
 * comparta en redes sin tener que pasar por la Grilla. Se cierra con la X y
 * vuelve el día operativo siguiente (es una acción diaria: cerrarlo para
 * siempre lo perdería). La Grilla conserva su propio botón.
 *
 * El storage se lee con `useSyncExternalStore`: el servidor no lo conoce y su
 * snapshot es "oculto", así que la hidratación coincide y el botón aparece recién
 * en el cliente.
 */
export function ShareScheduleFab({
  slug,
  bookingAdvanceDays,
  trackAction,
  operatingDate,
}: {
  slug: string
  bookingAdvanceDays: number
  trackAction: TrackStoryExport
  /** Día operativo de Hoy ('YYYY-MM-DD'): el cierre vale hasta que cambie. */
  operatingDate: string
}) {
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  const closedBefore = useSyncExternalStore(
    noSubscription,
    () => readClosedDay(slug) === operatingDate,
    () => true,
  )

  if (closedBefore || dismissed) return null

  return (
    <>
      <div className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center rounded-full bg-primary text-primary-foreground shadow-lg lg:right-6 lg:bottom-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-l-full pr-2 pl-4 text-sm font-semibold transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Share2 aria-hidden className="h-4 w-4" />
          Compartir horarios
        </button>
        <button
          type="button"
          aria-label="Cerrar hasta mañana"
          onClick={() => {
            writeClosedDay(slug, operatingDate)
            setDismissed(true)
          }}
          className="inline-flex h-11 w-9 items-center justify-center rounded-r-full text-primary-foreground/80 transition-colors hover:bg-primary/90 hover:text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <StoryShareDialog
          slug={slug}
          bookingAdvanceDays={bookingAdvanceDays}
          trackAction={trackAction}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
