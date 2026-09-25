// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useArtNow } from '@/hooks/use-art-now'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useArtNow (#29)', () => {
  it('expone la fecha/hora ART (UTC-3) actual tras el primer efecto', () => {
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z')) // ART 07:30
    const { result } = renderHook(() => useArtNow())
    expect(result.current).toEqual({ date: '2026-06-09', time: '07:30' })
  })

  it('se refresca cada minuto sin re-montar', () => {
    vi.setSystemTime(new Date('2026-06-09T12:59:30Z')) // ART 09:59
    const { result } = renderHook(() => useArtNow())
    expect(result.current.time).toBe('09:59')

    // Cruza el minuto: advanceTimersByTime mueve el reloj fake +60s (a 13:00:30Z
    // = ART 10:00) y dispara el intervalo, que debe recomputar artNow para que un
    // slot recien vencido deje de considerarse futuro/clickeable.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.time).toBe('10:00')
  })

  it('limpia el intervalo al desmontar', () => {
    vi.setSystemTime(new Date('2026-06-09T10:30:00Z'))
    // Timers pendientes, no `vi.spyOn(globalThis, 'clearInterval')`: con fake
    // timers ese spy captura el clearInterval FALSO y Vitest lo reinstala en cada
    // restoreAllMocks (también al cerrar el archivo), así que los archivos
    // siguientes del worker heredarían un clearInterval de un reloj muerto.
    const { unmount } = renderHook(() => useArtNow())
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
