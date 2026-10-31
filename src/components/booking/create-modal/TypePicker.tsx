'use client'

import { useId } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Ban, Clock, Repeat, Users, type LucideIcon } from 'lucide-react'
import { choiceChipClass, SegmentedControl } from '@/components/ui/segmented-control'
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
  const hintId = useId()
  return (
    <>
      {/* El mismo margen de 16 px que el formulario de abajo (12 + el `p-1` del
          scroll): pegados al borde de la pantalla, los chips no se leían como
          parte del modal. El `p-1` deja lugar al anillo de foco, que el
          `overflow-x-auto` recortaría. */}
      <div className="px-3 pt-2 lg:hidden">
        <SegmentedControl
          className="flex gap-1.5 overflow-x-auto p-1"
          aria-label="¿Qué vas a agendar?"
          value={value}
          onValueChange={onChange}
          // 44 px también en tablet: hasta `lg` esto se toca con el dedo.
          itemClassName={(active) =>
            cn(
              choiceChipClass(active),
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap md:h-11',
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
            // El nombre accesible es solo el título; la línea de ayuda va como
            // descripción (si no, el radio se llama "Turno fijo Todas las…").
            aria-label={t.title}
            aria-describedby={`${hintId}-${t.value}`}
            // Solo la elegida lleva caja (borde `primary` + tinte); las otras son
            // renglones sin borde: cuatro cajas iguales eran ruido alrededor de la
            // única que importa.
            className={cn(
              'group flex items-start gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-accent',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              'data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:hover:bg-primary/5 dark:data-[state=checked]:bg-primary/10 dark:data-[state=checked]:hover:bg-primary/10',
            )}
          >
            <t.icon
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-data-[state=checked]:text-primary"
              aria-hidden
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">{t.title}</span>
              <span id={`${hintId}-${t.value}`} className="block text-xs text-muted-foreground">
                {t.hint}
              </span>
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </>
  )
}
