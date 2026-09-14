'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Ban, Clock, Repeat, Users, type LucideIcon } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import type { BookingKind } from './types'

const TYPES: Array<{ value: BookingKind; title: string; hint: string; icon: LucideIcon }> = [
  { value: 'turno', title: 'Turno', hint: 'Una hora de cancha para alguien', icon: Clock },
  {
    value: 'fijo',
    title: 'Turno fijo',
    hint: 'Todas las semanas, mismo día y hora',
    icon: Repeat,
  },
  {
    value: 'evento',
    title: 'Evento',
    hint: 'Varias horas: escuelita, torneo, cumpleaños',
    icon: Users,
  },
  {
    value: 'bloqueo',
    title: 'Bloquear cancha',
    hint: 'Nadie puede usarla: mantenimiento, cierre',
    icon: Ban,
  },
]

/**
 * "¿Qué vas a agendar?" — los 4 tipos del modal único (pages/grilla.md §3bis).
 * Escritorio: columna a la izquierda con ícono + título + una línea. Teléfono:
 * fila de chips arriba (mismo estado, resuelto por CSS — no por un hook).
 */
export function TypePicker({
  value,
  onChange,
}: {
  value: BookingKind
  onChange: (v: BookingKind) => void
}) {
  return (
    <>
      <div className="lg:hidden">
        <SegmentedControl
          className="flex gap-1.5 overflow-x-auto pb-1"
          aria-label="¿Qué vas a agendar?"
          value={value}
          onValueChange={onChange}
          itemClassName={(active) =>
            cn(
              'flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-accent',
            )
          }
          options={TYPES.map((t) => ({
            value: t.value,
            label: (
              <span className="flex items-center gap-1.5">
                <t.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t.title}
              </span>
            ),
          }))}
        />
      </div>

      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={(v) => onChange(v as BookingKind)}
        aria-label="¿Qué vas a agendar?"
        className="hidden w-60 shrink-0 flex-col gap-2 border-r border-border p-4 lg:flex"
      >
        <h3 className="px-1 text-sm font-semibold text-foreground">¿Qué vas a agendar?</h3>
        {TYPES.map((t) => (
          <RadioGroupPrimitive.Item
            key={t.value}
            value={t.value}
            className={cn(
              'group flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              'data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 dark:data-[state=checked]:bg-primary/10',
            )}
          >
            <t.icon
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-data-[state=checked]:text-primary"
              aria-hidden
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">{t.title}</span>
              <span className="block text-xs text-muted-foreground">{t.hint}</span>
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </>
  )
}
