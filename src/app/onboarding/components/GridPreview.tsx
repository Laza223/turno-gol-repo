'use client'

import { AnimatePresence, m } from 'motion/react'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import type { CourtRow } from '@/modules/courts/court.types'
import { minPrice, type Draft } from './step-courts/constants'

type Props = {
  existingCourts: CourtRow[]
  drafts: Draft[]
}

type Column = { key: string; name: string; priceCents: number | null; isDraft: boolean }

/**
 * Vista previa del paso 3: la grilla en miniatura. Cada cancha —existente o
 * recién agregada— es una columna; agregar una cancha es ver aparecer la
 * columna (§C.1 del plan de refactor). Componente propio y liviano a
 * propósito: NO monta `BookingGrid` (11 archivos, Realtime, drag) para una
 * previsualización que no necesita ni turnos reales ni interacción.
 *
 * Las filas de adentro son decorativas (`aria-hidden`): sugieren "esto es una
 * grilla de horarios" sin fingir horas que este paso no conoce todavía — esas
 * llegan recién en el paso 2, y esta previa no las recibe.
 *
 * Cada columna nueva entra animada (`AnimatePresence` + `layout`, plan de
 * refactor §F): agregar una cancha se VE aparecer, no solo cambia el conteo.
 * `motion` autorizado solo para el onboarding (MASTER §5.1) — este componente
 * es exclusivo del wizard (único importer: `StepCourts`).
 */
export function GridPreview({ existingCourts, drafts }: Props) {
  const columns: Column[] = [
    ...existingCourts.map((c) => ({
      key: `court-${c.id}`,
      name: c.name,
      priceCents: minPrice(c),
      isDraft: false,
    })),
    ...drafts.map((d) => ({
      key: `draft-${d.key}`,
      name: d.name.trim() || 'Cancha nueva',
      priceCents: d.priceCents,
      isDraft: true,
    })),
  ]

  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu grilla</p>
      {columns.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Agregá una cancha para verla acá.</p>
      ) : (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <AnimatePresence initial={false}>
            {columns.map((col) => (
              <m.div
                key={col.key}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28, duration: 0.2 }}
                className={cn(
                  'w-24 shrink-0 rounded-lg border p-2',
                  col.isDraft
                    ? 'border-dashed border-emerald-600/50 bg-primary/5'
                    : 'border-border bg-card',
                )}
              >
                <p className="truncate text-xs font-semibold text-foreground">{col.name}</p>
                <div aria-hidden className="mt-2 space-y-1">
                  <div className="h-2 rounded bg-muted" />
                  <div className="h-2 rounded bg-muted" />
                  <div className="h-2 rounded bg-muted" />
                </div>
                <p className="mt-2 text-[11px] font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                  {col.priceCents != null ? formatArs(col.priceCents) : '—'}
                </p>
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
