// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePersistedDensity } from '@/hooks/use-persisted-density'

const KEY = 'tg-grilla-density'

// ─── localStorage mock (patrón push-notification-dismiss.test.tsx: happy-dom
// implementa Storage con own-properties, spyOn(Storage.prototype) no intercepta) ─
let store: Record<string, string> = {}
const defaultGetItem = (key: string) => store[key] ?? null
const defaultSetItem = (key: string, val: string) => {
  store[key] = val
}
const localStorageMock = {
  getItem: vi.fn(defaultGetItem),
  setItem: vi.fn(defaultSetItem),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  clear: () => {
    store = {}
  },
}

const origLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
})

afterAll(() => {
  if (origLocalStorage) Object.defineProperty(globalThis, 'localStorage', origLocalStorage)
  else delete (globalThis as Record<string, unknown>).localStorage
})

beforeEach(() => {
  store = {}
  localStorageMock.getItem.mockClear().mockImplementation(defaultGetItem)
  localStorageMock.setItem.mockClear().mockImplementation(defaultSetItem)
})

describe('usePersistedDensity', () => {
  it('lee la densidad persistida post-mount (compact)', () => {
    store[KEY] = 'compact'
    const { result } = renderHook(() => usePersistedDensity())
    expect(result.current.isCompact).toBe(true)
  })

  it('toggleDensity alterna y persiste el valor nuevo en localStorage', () => {
    const { result } = renderHook(() => usePersistedDensity())
    expect(result.current.isCompact).toBe(false)

    act(() => result.current.toggleDensity())
    expect(result.current.isCompact).toBe(true)
    expect(store[KEY]).toBe('compact')

    act(() => result.current.toggleDensity())
    expect(result.current.isCompact).toBe(false)
    expect(store[KEY]).toBe('comfortable')
  })

  it('el updater es puro: un toggle escribe en storage EXACTAMENTE 1 vez bajo StrictMode (react-doctor no-impure-state-updater)', () => {
    // StrictMode doble-invoca los updaters de setState en dev: si el setItem
    // vive DENTRO del updater (código pre-fix), acá se observan 2 escrituras.
    const { result } = renderHook(() => usePersistedDensity(), { wrapper: StrictMode })
    localStorageMock.setItem.mockClear()

    act(() => result.current.toggleDensity())

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(KEY, 'compact')
  })

  it('storage bloqueado: el toggle sigue funcionando en la sesión', () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('SecurityError')
    })
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => usePersistedDensity())
    act(() => result.current.toggleDensity())
    expect(result.current.isCompact).toBe(true)
  })
})
