'use client'

import * as React from 'react'
import type { ToastProps } from '@/components/ui/toast'

export type ToastVariant = NonNullable<ToastProps['variant']>

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastItem = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  /** ms before auto-dismiss. Errors persist (very long) per design-system §6. */
  duration: number
  open: boolean
  /** "Deshacer" (§6.2 matriz deshacer-vs-confirmar, clase A: reversible barato). */
  action?: ToastAction
}

export type ToastInput = {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
  action?: ToastAction
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  default: 4000,
  success: 4000,
  destructive: 1_000_000, // persist until dismissed (errors)
}

/** Con acción de Deshacer, 4s no alcanza para leer + decidir + clickear. */
const ACTION_DURATION = 10_000

let counter = 0
let toasts: ToastItem[] = []
const listeners = new Set<(t: ToastItem[]) => void>()

function emit() {
  listeners.forEach((l) => l(toasts))
}

function dismiss(id: string) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, open: false } : t))
  emit()
  // Remove after the close animation.
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 200)
}

export function toast(input: ToastInput): { id: string; dismiss: () => void } {
  const id = String(++counter)
  const variant = input.variant ?? 'default'
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant,
    duration: input.duration ?? (input.action ? ACTION_DURATION : DEFAULT_DURATIONS[variant]),
    open: true,
    action: input.action,
  }
  toasts = [item, ...toasts].slice(0, 4)
  emit()
  return { id, dismiss: () => dismiss(id) }
}

export function useToast() {
  const [state, setState] = React.useState<ToastItem[]>(toasts)

  React.useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])

  return { toasts: state, toast, dismiss }
}
