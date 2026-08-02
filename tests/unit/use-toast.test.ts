// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { toast, useToast } from '@/hooks/use-toast'

afterEach(() => {
  // Vacía el store global entre tests — es estado a nivel de módulo, no de componente.
  const { result } = renderHook(() => useToast())
  act(() => {
    result.current.toasts.forEach((t) => result.current.dismiss(t.id))
  })
})

describe('toast() — duración con acción de Deshacer', () => {
  it('sin action, usa el default de la variant (success/default = 4000ms)', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'Guardado' })
    })
    expect(result.current.toasts[0]?.duration).toBe(4000)
  })

  it('con action, usa 10000ms en vez del default de 4000 — hace falta tiempo para leer y decidir', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'Quitado', action: { label: 'Deshacer', onClick: vi.fn() } })
    })
    expect(result.current.toasts[0]?.duration).toBe(10_000)
  })

  it('un duration explícito sigue ganando aunque haya action', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'Quitado', duration: 2000, action: { label: 'Deshacer', onClick: vi.fn() } })
    })
    expect(result.current.toasts[0]?.duration).toBe(2000)
  })

  it('destructive sigue persistiendo (1.000.000ms) aunque no tenga action', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'Error', variant: 'destructive' })
    })
    expect(result.current.toasts[0]?.duration).toBe(1_000_000)
  })
})
