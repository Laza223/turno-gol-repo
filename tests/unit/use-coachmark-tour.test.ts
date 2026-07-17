// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCoachmarkTour } from '@/hooks/use-coachmark-tour'

const STEPS = [
  { targetId: 'a', text: 'Uno' },
  { targetId: 'b', text: 'Dos' },
  { targetId: 'c', text: 'Tres' },
]

function addAnchor(id: string) {
  const el = document.createElement('div')
  el.setAttribute('data-tour-id', id)
  document.body.appendChild(el)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('useCoachmarkTour', () => {
  it('avanza 0→1→2 con next() y llama onFinish al pasar el último paso', () => {
    addAnchor('a')
    addAnchor('b')
    addAnchor('c')
    const onFinish = vi.fn()
    const { result } = renderHook(() => useCoachmarkTour(STEPS, { onFinish }))

    expect(result.current.index).toBe(0)
    expect(result.current.current?.targetId).toBe('a')

    act(() => result.current.next())
    expect(result.current.index).toBe(1)
    expect(result.current.current?.targetId).toBe('b')

    act(() => result.current.next())
    expect(result.current.index).toBe(2)
    expect(result.current.current?.targetId).toBe('c')

    act(() => result.current.next())
    expect(onFinish).toHaveBeenCalledOnce()
    expect(result.current.active).toBe(false)
    expect(result.current.current).toBeNull()
  })

  it('skip() termina el tour de inmediato sin recorrer los pasos restantes', () => {
    addAnchor('a')
    addAnchor('b')
    addAnchor('c')
    const onFinish = vi.fn()
    const { result } = renderHook(() => useCoachmarkTour(STEPS, { onFinish }))

    act(() => result.current.skip())
    expect(onFinish).toHaveBeenCalledOnce()
    expect(result.current.active).toBe(false)
  })

  it('salta el paso cuyo anchor no está en el DOM (skip defensivo)', () => {
    addAnchor('a')
    // 'b' NO existe en el DOM.
    addAnchor('c')
    const onFinish = vi.fn()
    const { result } = renderHook(() => useCoachmarkTour(STEPS, { onFinish }))

    act(() => result.current.next()) // pasa de 'a' a 'b'
    // El skip defensivo detecta que 'b' no existe y salta directo a 'c'.
    expect(result.current.current?.targetId).toBe('c')
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('si ningún anchor restante existe, termina el tour (onFinish)', () => {
    addAnchor('a')
    // 'b' y 'c' no existen en el DOM.
    const onFinish = vi.fn()
    const { result } = renderHook(() => useCoachmarkTour(STEPS, { onFinish }))

    act(() => result.current.next()) // 'a'→'b' (falta)→'c' (falta)→fin
    expect(onFinish).toHaveBeenCalledOnce()
    expect(result.current.active).toBe(false)
  })

  it('salta el paso 0 si su anchor no existe ya al montar', () => {
    // 'a' no existe; 'b' sí.
    addAnchor('b')
    addAnchor('c')
    const onFinish = vi.fn()
    const { result } = renderHook(() => useCoachmarkTour(STEPS, { onFinish }))

    expect(result.current.current?.targetId).toBe('b')
    expect(onFinish).not.toHaveBeenCalled()
  })
})
