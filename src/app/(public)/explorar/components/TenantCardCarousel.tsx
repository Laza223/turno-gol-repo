'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MAX_SLIDES = 5

type Props = {
  photos: string[]
  name: string
  /** Destino al tocar una foto (perfil del complejo). */
  href: string
}

/**
 * Carrusel de fotos para la card de /explorar. CSS scroll-snap + JS mínimo
 * (chevrons, dots y flechas de teclado sobre el track focusable). Máximo
 * 5 fotos; si hay más, la última muestra "+N" (mismo patrón que TenantGallery).
 *
 * Cada slide linkea al perfil con tabIndex=-1: el link "real" para teclado y
 * lectores de pantalla sigue siendo el título de la card (stretched-link).
 * Con una sola foto no hay chrome ni z-index: la card se comporta como antes.
 */
export default function TenantCardCarousel({ photos, name, href }: Props) {
  const slides = photos.slice(0, MAX_SLIDES)
  const extra = photos.length - MAX_SLIDES
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  // Solo con 2+ fotos el carrusel necesita capturar gestos por encima del
  // stretched-link de la card (z-10); con una foto el tap sigue navegando.
  const interactive = slides.length > 1

  function scrollToIndex(i: number) {
    const el = trackRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(i, slides.length - 1))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: clamped * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }

  function onScroll() {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIndex(Math.max(0, Math.min(i, slides.length - 1)))
  }

  return (
    <div className={interactive ? 'absolute inset-0 z-10' : 'absolute inset-0'}>
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carrusel"
        aria-label={`Fotos de ${name}`}
        tabIndex={interactive ? 0 : -1}
        onScroll={interactive ? onScroll : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  scrollToIndex(index - 1)
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  scrollToIndex(index + 1)
                }
              }
            : undefined
        }
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
      >
        {slides.map((src, i) => (
          <Link
            key={`${src}-${i}`}
            href={href}
            tabIndex={-1}
            aria-hidden
            draggable={false}
            className="relative h-full w-full shrink-0 snap-center"
          >
            <Image
              src={src}
              alt={i === 0 ? `Cancha de ${name}` : `${name} — foto ${i + 1}`}
              fill
              loading="lazy"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
            {i === MAX_SLIDES - 1 && extra > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-lg font-semibold text-white">
                +{extra}
              </span>
            )}
          </Link>
        ))}
      </div>

      {interactive && (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            disabled={index === 0}
            onClick={() => scrollToIndex(index - 1)}
            className="absolute left-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-card focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed group-hover:disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            disabled={index === slides.length - 1}
            onClick={() => scrollToIndex(index + 1)}
            className="absolute right-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-card focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed group-hover:disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>

          <div
            aria-hidden
            className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1"
          >
            {slides.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
