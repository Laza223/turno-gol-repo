'use client'

import type { ReactNode } from 'react'
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
}: {
  children: ReactNode
  pendingLabel?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
