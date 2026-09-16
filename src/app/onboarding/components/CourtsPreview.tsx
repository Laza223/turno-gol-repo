'use client'

import { AnimatePresence, m } from 'motion/react'
import CourtCard from '@/app/(public)/[slug]/components/CourtCard'
import type { PublicCourtCard } from '@/modules/tenants/public.service'
import type { CourtRow } from '@/modules/courts/court.types'
import { minPrice, type Draft } from './step-courts/constants'

type Props = {
  existingCourts: CourtRow[]
  drafts: Draft[]
}

/**
 * Vista previa del paso 3: las canchas **tal cual las ve un jugador** en la
 * página pública del complejo.
 *
 * Reusa `CourtCard`, el componente real del portal (presentacional puro, sin
 * links ni data fetching), en vez de dibujar una grilla en miniatura con barras
 * grises: el dueño tiene que poder ver qué gana cargando la foto y el precio,
 * no una abstracción. Es la misma razón por la que la foto volvió a pedirse en
 * este paso — casi nadie volvía a cargarla después desde `/canchas`.
 *
 * Cada cancha nueva entra animada (`AnimatePresence` + `layout`, siempre
 * montado: si viviera dentro del ternario de "hay columnas", sacar la última
 * desmontaría el boundary en el mismo tick que su hijo y la salida no animaría).
 * `motion` está autorizado sólo para el onboarding (MASTER §5.1).
 */
export function CourtsPreview({ existingCourts, drafts }: Props) {
  const cards: PublicCourtCard[] = [
    ...existingCourts.map((c) => ({
      id: `court-${c.id}`,
      name: c.name,
      surfaceType: c.surfaceType,
      isCovered: c.isCovered,
      hasLighting: c.hasLighting,
      format: c.format,
      capacity: c.capacity,
      photos: c.photos,
      fromPriceCents: minPrice(c),
    })),
    ...drafts.map((d) => ({
      id: `draft-${d.key}`,
      name: d.name.trim() || 'Cancha nueva',
      surfaceType: d.surfaceType,
      isCovered: d.isCovered,
      hasLighting: true,
      format: d.format,
      capacity: d.format * 2,
      photos: d.photoUrl ? [d.photoUrl] : [],
      fromPriceCents: d.priceCents,
    })),
  ]

  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Así te ven los jugadores
      </p>
      {cards.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Agregá una cancha para verla acá.</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-1">
        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <m.div
              key={card.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <CourtCard court={card} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
