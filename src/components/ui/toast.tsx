'use client'

import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    // BUG DE PRODUCCIÓN, no de las stories: `<Toaster/>` vive en el layout raíz,
    // hermano del portal de los diálogos. Cuando hay un Dialog abierto, Radix
    // llama `hideOthers()` y `aria-hidden` marca a todo el resto del árbol con
    // `data-aria-hidden="true"` — el viewport de toasts incluido. Resultado: un
    // toast disparado con un diálogo abierto queda INVISIBLE para lectores de
    // pantalla (y `getByRole` tampoco lo ve, que es cómo se detectó).
    //
    // `aria-hidden` whitelistea cualquier nodo con atributo `aria-live`, así que
    // basta con declararlo. Va en `"off"` a propósito: alcanza para matchear el
    // selector sin crear una live region nueva que duplique los anuncios de la
    // que Radix Toast ya maneja por su cuenta.
    aria-live="off"
    className={cn(
      'fixed bottom-0 right-0 z-100 flex max-h-dvh w-full flex-col gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:max-w-sm',
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  // Barra de acento lateral (before:) + salida deslizando a la derecha, coherente
  // con el swipe. En dark el fill translúcido gana un backdrop-blur (glass,
  // consistente con card-premium); en light los fills opacos lo anulan solos.
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-8 shadow-lg transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-4 data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=move]:transition-none dark:backdrop-blur-md before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
  {
    variants: {
      variant: {
        default:
          'border-border bg-card text-foreground before:bg-linear-to-b before:from-emerald-500 before:to-teal-600',

        // LOS FILLS DE LIGHT SON OPACOS A PROPÓSITO. Un toast puede aparecer con un
        // <Dialog> todavía abierto (o cerrándose) detrás: el overlay `bg-black/50`
        // oscurece TODO lo que hay debajo, y un fill translúcido (`bg-*/10`) compone
        // contra ese negro en vez de contra el fondo de la app. Medido con axe:
        //   success translúcido sobre el overlay:      1.40:1  (ilegible)
        //   destructive translúcido sobre el overlay:  1.30:1  (ilegible)
        // Con fill opaco el contraste no depende de qué haya atrás:
        //   text-green-800 sobre bg-green-50:  6.81:1
        //   text-red-700   sobre bg-red-50:    5.91:1
        // El foreground de light también se ajusta: los tokens crudos (`text-success`,
        // `text-destructive`) no llegan a AA sobre estos fills. En dark los tokens sí
        // pasan y se mantienen.
        success:
          'border-success/30 bg-green-50 text-green-800 dark:border-success/40 dark:bg-success/15 dark:text-success before:bg-linear-to-b before:from-emerald-500 before:to-teal-600',
        destructive:
          'border-destructive/30 bg-red-50 text-red-700 dark:border-destructive/40 dark:bg-destructive/15 dark:text-destructive before:bg-linear-to-b before:from-red-500 before:to-red-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  />
))
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-current/30 bg-transparent px-3 text-sm font-semibold transition-colors hover:bg-current/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    aria-label="Cerrar"
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" aria-hidden="true" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm leading-snug opacity-90', className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

export {
  type ToastProps,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
}
