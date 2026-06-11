// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CityCount } from '@/modules/tenants/search.service'

const pushMock = vi.fn()
let currentParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => currentParams,
}))

import SearchBar from '@/app/(public)/explorar/components/SearchBar'

const CITIES: CityCount[] = [
  { city: 'Córdoba', province: 'Córdoba', count: 8 },
  { city: 'Rosario', province: 'Santa Fe', count: 5 },
]

function cityInput(): HTMLInputElement {
  return screen.getByRole('combobox', { name: 'Localidad' }) as HTMLInputElement
}

function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas' }))
}

beforeEach(() => {
  pushMock.mockReset()
  currentParams = new URLSearchParams()
})

describe('SearchBar /explorar — autocompletado de localidad', () => {
  it('muestra el label de la ciudad que viene en la URL (city+province)', () => {
    currentParams = new URLSearchParams('city=Rosario&province=Santa+Fe&q=club')
    render(<SearchBar cities={CITIES} />)
    expect(cityInput().value).toBe('Rosario, Santa Fe')
  })

  it('con city sin province en la URL (chips populares) muestra la ciudad cruda', () => {
    currentParams = new URLSearchParams('city=Rosario')
    render(<SearchBar cities={CITIES} />)
    expect(cityInput().value).toBe('Rosario')
  })

  it('URL stale (ciudad que ya no está en la lista) nunca muestra el separador interno "||"', () => {
    currentParams = new URLSearchParams('city=Ushuaia&province=Tierra+del+Fuego')
    render(<SearchBar cities={CITIES} />)
    expect(cityInput().value).toBe('Ushuaia, Tierra del Fuego')
  })

  it('elegir una ciudad y buscar setea city+province preservando el resto', () => {
    currentParams = new URLSearchParams('q=club&surfaces=cement')
    render(<SearchBar cities={CITIES} />)

    fireEvent.click(cityInput())
    fireEvent.mouseDown(screen.getByRole('option', { name: /Córdoba/ }))
    submitForm()

    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).toContain(`city=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain(`province=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain('q=club')
    expect(url).toContain('surfaces=cement')
  })

  it('cambiar de ciudad no arrastra la province anterior de la URL', () => {
    currentParams = new URLSearchParams('city=Rosario&province=Santa+Fe')
    render(<SearchBar cities={CITIES} />)

    fireEvent.click(cityInput())
    fireEvent.mouseDown(screen.getByRole('option', { name: /Córdoba/ }))
    submitForm()

    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).toContain(`city=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain(`province=${encodeURIComponent('Córdoba')}`)
    expect(url).not.toContain('Santa')
  })

  it('vaciar la localidad y buscar borra city y province de la URL', () => {
    currentParams = new URLSearchParams('city=Rosario&province=Santa+Fe&q=club')
    render(<SearchBar cities={CITIES} />)

    fireEvent.change(cityInput(), { target: { value: '' } })
    fireEvent.blur(cityInput())
    submitForm()

    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).not.toContain('city=')
    expect(url).not.toContain('province=')
    expect(url).toContain('q=club')
  })
})
