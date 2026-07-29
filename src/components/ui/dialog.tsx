'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-40 bg-black/50 dark:bg-black/70 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * Clases del panel del modal. Exportadas porque `BookingFormModal` monta Radix
 * directo (529 líneas, migrarlo entero es riesgo innecesario) y necesita el
 * mismo comportamiento mobile sin duplicar la receta.
 *
 * Tres decisiones mobile, todas por iOS:
 *  - **Anclado arriba en mobile** (`top-4 translate-y-0`) en vez de centrado.
 *    Centrado con `translate-y-[-50%]`, al abrirse el teclado la mitad inferior
 *    del modal —incluido el botón de submit— queda detrás del teclado, y ni
 *    `svh` ni `dvh` se recalculan cuando el teclado aparece. Anclarlo arriba
 *    resuelve el 90% del problema sin una línea de JS de viewport.
 *  - **`dvh` y no `svh`**: unifica con `ui/sheet`, que ya usaba `dvh`. Tener dos
 *    unidades distintas en primitivos hermanos era una fuente silenciosa de
 *    diferencias de alto.
 *  - **`w-[calc(100%-2rem)]` y no `100vw`**: `100vw` no descuenta el área bajo
 *    el notch con `viewport-fit=cover` y no se recalcula si iOS zoomea.
 */
export const dialogContentClass =
  'fixed left-[50%] top-4 z-50 grid w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto translate-x-[-50%] translate-y-0 gap-4 border border-border bg-popover/95 p-6 text-popover-foreground shadow-2xl backdrop-blur-md duration-200 md:top-[50%] md:translate-y-[-50%] md:max-h-[90dvh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 rounded-2xl'

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // Sin description por default: silencia el warning de Radix; el spread
      // de props abajo gana si el caller pasa su propio aria-describedby.
      aria-describedby={undefined}
      className={cn(dialogContentClass, className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-accent-foreground p-1 hover:bg-muted/40">
        <X className="h-4 w-4" />
        <span className="sr-only">Cerrar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose }
