// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ZONA_STORAGE_KEY } from '@/lib/zona-storage'
import type { CityCount } from '@/modules/tenants/search.service'

const pushMock = vi.fn()
const replaceMock = vi.fn()
let currentParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => currentParams,
}))

import SearchBar from '@/app/(public)/explorar/components/SearchBar'

const CITIES: CityCount[] = [{ city: 'Rosario', province: 'Santa Fe', count: 5 }]

beforeEach(() => {
  pushMock.mockReset()
  replaceMock.mockReset()
  currentParams = new URLSearchParams()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ZONA_STORAGE_KEY, JSON.stringify({ city: 'Rosario', province: 'Santa Fe' }))
})

afterEach(() => {
  vi.resetModules()
})

describe('SearchBar /explorar — arranca en la zona guardada', () => {
  it('sin filtros y con zona: reemplaza la URL por city+province', async () => {
    render(<SearchBar cities={CITIES} />)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1))
    expect(replaceMock).toHaveBeenCalledWith('/explorar?city=Rosario&province=Santa+Fe')
  })

  it('con filtros en la URL no se mete', async () => {
    currentParams = new URLSearchParams('q=club')
    render(<SearchBar cities={CITIES} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('entró con filtros y después los saca (URL pelada): la zona NO se le vuelve a imponer', async () => {
    currentParams = new URLSearchParams('city=Rosario&province=Santa+Fe')
    const { rerender } = render(<SearchBar cities={CITIES} />)
    await new Promise((r) => setTimeout(r, 20))

    // "Todas las ciudades" + Buscar → /explorar pelado.
    currentParams = new URLSearchParams()
    rerender(<SearchBar cities={CITIES} />)
    await new Promise((r) => setTimeout(r, 20))

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('sin zona guardada no hace nada', async () => {
    localStorage.clear()
    render(<SearchBar cities={CITIES} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
