// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNowMs, useNowMsAfterHydration } from '@/hooks/use-now'
import { useArtNow } from '@/hooks/use-art-now'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useNowMs (reloj como store externo, B7)', () => {
  it('devuelve el instante actual y avanza al cruzar el minuto', () => {
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z'))
    const { result } = renderHook(() => useNowMs())
    const first = result.current
    expect(first).toBe(Date.now())

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe(first + 60_000)
  })

  it('un solo setInterval aunque haya N consumidores montados', () => {
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z'))
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const a = renderHook(() => useNowMs())
    const b = renderHook(() => useNowMs())
    const c = renderHook(() => useArtNow())

    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(a.result.current).toBe(b.result.current)

    // El interval se limpia recién cuando se va el ÚLTIMO suscriptor: si se
    // limpiara con el primer unmount, los otros dos dejarían de actualizarse en
    // silencio (la grilla congelaría la hora y un slot vencido seguiría
    // clickeable).
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    a.unmount()
    b.unmount()
    expect(clearSpy).not.toHaveBeenCalled()
    c.unmount()
    expect(clearSpy).toHaveBeenCalled()
  })

  it('getSnapshot es estable entre ticks: dos lecturas seguidas dan el MISMO número', () => {
    // Si devolviera `Date.now()` fresco, React vería un valor distinto en cada
    // llamada a getSnapshot y el render entraría en loop infinito.
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z'))
    const { result, rerender } = renderHook(() => useNowMs())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe('useNowMsAfterHydration', () => {
  it('una vez montado se comporta igual que useNowMs', () => {
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z'))
    const { result } = renderHook(() => useNowMsAfterHydration())
    expect(result.current).toBe(Date.now())
  })
})

describe('useArtNow: identidad del objeto', () => {
  it('devuelve la MISMA referencia entre renders del mismo minuto', () => {
    // El hook viejo devolvía un valor de estado, o sea referencia estable entre
    // ticks. Derivarlo del reloj sin memo devolvería un objeto nuevo por render
    // y rompería las deps de cualquier useMemo/useEffect que lo consuma.
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z'))
    const { result, rerender } = renderHook(() => useArtNow())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).not.toBe(first)
    expect(result.current.time).toBe('07:31')
  })
})
