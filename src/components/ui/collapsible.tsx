'use client'

import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { cn } from '@/lib/utils'

/**
 * Progressive disclosure genérico (Fase 3 UX): separa campos secundarios de un
 * form largo bajo un trigger ("Opciones avanzadas", "Excepciones y detalles
 * avanzados"). `CollapsibleContent` anima con `accordion-down`/`accordion-up`
 * (globals.css — 0.2s, dentro del límite de MASTER §5.2), hasta ahora huérfanas
 * porque ningún componente las consumía. Esas keyframes leen
 * `--accordion-content-height`; Radix Collapsible expone la altura medida como
 * `--radix-collapsible-content-height` en el propio Content, así que se mapea
 * una a la otra vía inline style en vez de tocar los nombres en globals.css.
 *
 * `forceMount` + `data-[state=closed]:hidden` NO es opcional: sin forceMount,
 * Radix DESMONTA los children al colapsar (`children: isOpen && children`), y
 * cualquier input con `name=` adentro desaparece del FormData del form — un
 * campo llenado y luego colapsado se pierde en silencio al hacer submit
 * (verificado: closes_next_day y guestPhone morían así). Con display:none los
 * inputs siguen en el DOM y serializan; a11y y foco quedan igual de excluidos
 * que con el desmonte.
 */
const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.Trigger

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, style, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    forceMount
    style={
      {
        ...style,
        '--accordion-content-height': 'var(--radix-collapsible-content-height)',
      } as React.CSSProperties
    }
    className={cn(
      'overflow-hidden data-[state=closed]:hidden data-[state=open]:animate-accordion-down motion-reduce:animate-none',
      className
    )}
    {...props}
  />
))
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
