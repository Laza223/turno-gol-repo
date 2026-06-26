'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

type Props = { photos: string[]; name: string }

/**
 * Galería de fotos del complejo con lightbox accesible (teclado: Esc / ← / →).
 * No renderiza nada si no hay fotos. Layout: 1 foto grande + hasta 4 thumbnails.
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
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close, prev, next])

  if (photos.length === 0) return null

  function openAt(i: number) {
    setIndex(i)
    setOpen(true)
  }

  const main = photos[0]
  const thumbs = photos.slice(1, 5)
  const extra = photos.length - 5

  return (
    <>
      <div className="grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl" style={{ height: 'clamp(220px, 38vw, 380px)' }}>
        <button
          type="button"
          onClick={() => openAt(0)}
          className="relative col-span-4 row-span-2 overflow-hidden bg-muted sm:col-span-2"
        >
          <Image
            src={main}
            alt={`${name} — foto principal`}
            fill
            priority
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 hover:scale-105 motion-reduce:hover:scale-100"
          />
        </button>
        {thumbs.map((p, i) => (
          <button
            key={p + i}
            type="button"
            onClick={() => openAt(i + 1)}
            className="relative hidden overflow-hidden bg-muted sm:block"
          >
            <Image
              src={p}
              alt={`${name} — foto ${i + 2}`}
              fill
              sizes="25vw"
              className="object-cover transition-transform duration-500 hover:scale-105 motion-reduce:hover:scale-100"
            />
            {i === thumbs.length - 1 && extra > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-lg font-semibold text-white">
                +{extra}
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${name}`}
          className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 p-4 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between text-white">
            <span className="text-sm tabular-nums">
              {index + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar galería"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="relative flex-1">
            <Image
              key={photos[index]}
              src={photos[index]}
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Foto siguiente"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
