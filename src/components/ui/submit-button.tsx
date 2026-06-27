'use client'

import type { ComponentProps, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

/**
 * Boton de submit con estado de carga (#19/#20/#21). Lee el `pending` del form
 * contenedor via useFormStatus, asi que mientras la Server Action corre queda
 * deshabilitado (evita doble submit) y muestra `pendingLabel`. Pensado para
 * usarse como hijo cliente de un <form action={serverAction}>.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Guardando…',
  className,
  variant,
  size,
}: {
  children: ReactNode
  pendingLabel?: string
  className?: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      isLoading={pending}
      aria-busy={pending}
      className={className}
      variant={variant}
      size={size}
    >
      {pending ? pendingLabel : children}
    </Button>
  )
}
