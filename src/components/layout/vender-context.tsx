'use client'

import { createContext, use } from 'react'

export type VenderContextValue = {
  /** El modal de venta está abierto. */
  open: boolean
  setOpen: (open: boolean) => void
  /**
   * Adelanta la carga del catálogo (los botones lo llaman al apuntarlos o tocarlos),
   * para que el modal abra con los productos ya listos.
   */
  prefetch: () => void
}

export const VenderContext = createContext<VenderContextValue | null>(null)

export function useVender(): VenderContextValue {
  const value = use(VenderContext)
  if (!value) throw new Error('useVender: falta <VenderProvider>')
  return value
}

/** Para quien puede montarse sin el proveedor (el riel en stories y tests): `null` si no hay. */
export function useOptionalVender(): VenderContextValue | null {
  return use(VenderContext)
}
