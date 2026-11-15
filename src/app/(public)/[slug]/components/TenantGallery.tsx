'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useScrollLock } from '@/hooks/use-scroll-lock'
import './ficha-rest.css'

type Props = { photos: string[]; name: string }

/**
 * Galería de fotos del complejo con lightbox accesible (teclado: Esc / ← / →).
 * No renderiza nada si no hay fotos. Layout (portal de vidrio): tira con scroll-snap en el celu y
 * tres columnas desde 1024 px (`.fr-gallery`); cada foto abre el visor en su lugar.
 */
export default function TenantGallery({ photos, name }: Props) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  const close = useCallback(() => setOpen(false), [])
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + photos.length) % photos.length),
    [photos.length],
  )
  const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close, prev, next])

  // El scroll-lock va aparte: `body { overflow: hidden }` no frena el scroll en
  // iOS Safari (el fondo se movía detrás del lightbox). Ver use-scroll-lock.
  useScrollLock(open)

  if (photos.length === 0) return null

  function openAt(i: number) {
    setIndex(i)
    setOpen(true)
  }

  const renderLightbox = () => {
    if (!open) return null
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Fotos de ${name}`}
        className="fixed inset-0 z-100 flex flex-col bg-slate-950/95 p-4"
      >
        <div className="flex items-center justify-between text-white">
          <span className="text-sm tabular-nums">
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar galería"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="relative flex-1">
          <Image
            key={photos[index]}
            src={photos[index]!}
            alt={`${name} — foto ${index + 1}`}
            fill
            sizes="100vw"
            className="object-contain"
          />
        </div>

        {photos.length > 1 && (
          <div className="flex items-center justify-center gap-4 text-white">
            <button
              type="button"
              onClick={prev}
              aria-label="Foto anterior"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Foto siguiente"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <ul className="fr-gallery">
        {photos.map((p, i) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => openAt(i)}
              className="relative block aspect-4/3 w-full overflow-hidden rounded-3xl border border-(--glass-line) bg-portal-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
            >
              <Image
                src={p}
                alt={`${name} — foto ${i + 1}`}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 46vw, 78vw"
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {renderLightbox()}
    </>
  )
}
