'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

/**
 * Tooltip del sistema (MASTER §7.4): delay 300ms en hover, inmediato en focus.
 * Obligatorio en botones icon-only, candados de rol y botones deshabilitados.
 * NO reemplaza el aria-label del trigger — lo complementa visualmente.
 *
 * El Provider vive embebido en cada Tooltip para no exigir plumbing en cada
 * layout/test (se pierde el "skip delay" agrupado de Radix; aceptable).
 */
const TooltipProvider = TooltipPrimitive.Provider

function Tooltip({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPrimitive.Provider>
  )
}

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Inversión de tokens (§6.1): contraste máximo en ambos temas sin hex.
        'z-50 overflow-hidden rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md',
        'animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
