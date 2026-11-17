// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import LocalityPicker from '@/components/geo/LocalityPicker'
import AddressFinder from '@/components/geo/AddressFinder'
import type { GeoAddress, GeoLocality, PickedAddress } from '@/modules/geo/geo.types'

/** Mini user-event: el repo no trae `@testing-library/user-event`. */
const userEvent = {
  setup() {
    const press = (key: string) => {
      const target = document.activeElement ?? document.body
      fireEvent.keyDown(target, { key })
    }
    return {
      async type(el: HTMLElement, text: string) {
        const enter = text.endsWith('{Enter}')
        const value = enter ? text.slice(0, -'{Enter}'.length) : text
        el.focus()
        fireEvent.change(el, { target: { value } })
        if (enter) press('Enter')
      },
      async click(el: HTMLElement) {
        fireEvent.click(el)
      },
      async keyboard(keys: string) {
        for (const m of keys.matchAll(/\{(\w+)\}/g)) press(m[1] ?? '')
      },
    }
  },
}

const LUJAN: GeoLocality = {
  city: 'Luján',
  province: 'Buenos Aires',
  department: 'Partido de Luján',
  lat: -34.57,
  lng: -59.1,
  source: 'dataset',
}
const MERCEDES: GeoLocality = {
  city: 'Mercedes',
  province: 'Corrientes',
  department: 'Mercedes',
  lat: -29.18,
  lng: -58.07,
  source: 'dataset',
}
const MITRE: GeoAddress = {
  label: 'Bartolomé Mitre 800, Luján, Buenos Aires',
  address: 'Bartolomé Mitre 800',
  city: 'Luján',
  province: 'Buenos Aires',
  lat: -34.5701,
  lng: -59.1049,
  source: 'georef',
}

type Routes = { localidades?: unknown; direcciones?: unknown; status?: number }

function stubApi({ localidades, direcciones, status = 200 }: Routes) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const body = url.includes('/localidades') ? localidades : direcciones
    return new Response(JSON.stringify(body ?? { results: [] }), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function ControlledPicker({ onChange }: { onChange: (v: GeoLocality | null) => void }) {
  const [value, setValue] = useState<GeoLocality | null>(null)
  return (
    <LocalityPicker
      id="loc"
      label="Localidad"
      value={value}
      locate={false}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

describe('LocalityPicker', () => {
  it('busca, navega con teclado y elige con Enter', async () => {
    stubApi({ localidades: { results: [LUJAN, MERCEDES] } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPicker onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: 'Localidad' })
    await user.type(input, 'merc')
    const options = await screen.findAllByRole('option')
    // Los 2 resultados + la salida "No está mi localidad" al final.
    expect(options).toHaveLength(3)
    expect(options[0]?.textContent).toContain('Buenos Aires · Partido de Luján')
    // Departamento igual a la ciudad: no ayuda, no se repite.
    expect(options[1]?.textContent).toBe('MercedesCorrientes')
    expect(options[2]?.textContent).toBe('No está mi localidadEscribirla a mano')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(MERCEDES)
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Mercedes, Corrientes')
  })

  it('con resultados la última fila deja escribirla a mano', async () => {
    stubApi({ localidades: { results: [LUJAN] } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPicker onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), 'jauregui')
    await user.click(await screen.findByRole('option', { name: /No está mi localidad/ }))
    expect(onChange).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Ciudad') as HTMLInputElement).value).toBe('jauregui')
    expect(screen.getByLabelText('Provincia')).toBeTruthy()
  })

  it('Escape descarta lo escrito y no elige nada', async () => {
    stubApi({ localidades: { results: [LUJAN] } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPicker onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), 'lujan')
    await screen.findByRole('option', { name: /Luján/ })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('option')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('sin resultados ofrece escribirla a mano y emite source manual', async () => {
    stubApi({ localidades: { results: [] } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPicker onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), 'Pueblo Chico')
    expect(await screen.findByText('No encontramos esa localidad.')).toBeTruthy()
    // El foco sale del input hacia el botón: el botón no puede desaparecer.
    fireEvent.blur(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: 'Escribirla a mano' }))
    const city = screen.getByLabelText('Ciudad') as HTMLInputElement
    expect(city.value).toBe('Pueblo Chico')
    await user.click(screen.getByLabelText('Provincia'))
    await user.click(await screen.findByRole('option', { name: 'Chubut' }))
    expect(onChange).toHaveBeenLastCalledWith({
      city: 'Pueblo Chico',
      province: 'Chubut',
      lat: null,
      lng: null,
      source: 'manual',
    })
  })

  it('degradado: avisa distinto y deja la salida manual', async () => {
    stubApi({ localidades: { results: [], degraded: true } })
    const user = userEvent.setup()
    render(<ControlledPicker onChange={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'Chivilcoy')
    expect(
      await screen.findByText('No pudimos buscar ahora. Podés escribirla a mano.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Escribirla a mano' })).toBeTruthy()
  })

  it('un error HTTP también deja la salida manual', async () => {
    stubApi({ localidades: {}, status: 500 })
    const user = userEvent.setup()
    render(<ControlledPicker onChange={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'Salta')
    expect(await screen.findByRole('button', { name: 'Escribirla a mano' })).toBeTruthy()
  })
})

function Harness({
  onChange,
  initial,
  names,
}: {
  onChange: (v: PickedAddress | null) => void
  initial?: PickedAddress
  names?: boolean
}) {
  return (
    <form>
      <AddressFinder idPrefix="addr" value={initial} onChange={onChange} names={names} />
    </form>
  )
}

async function chooseLujan(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('combobox', { name: 'Localidad' }), 'lujan')
  await user.click(await screen.findByRole('option', { name: /Luján/ }))
}

describe('AddressFinder', () => {
  it('candidato elegido: emite PickedAddress completo y muestra la tarjeta', async () => {
    stubApi({ localidades: { results: [LUJAN] }, direcciones: { results: [MITRE] } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)
    await chooseLujan(user)
    await user.type(screen.getByLabelText('Calle y altura'), 'Bartolomé Mitre 800{Enter}')
    await user.click(await screen.findByRole('button', { name: MITRE.label }))
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Bartolomé Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
      latitude: -34.5701,
      longitude: -59.1049,
    })
    expect(screen.getByText('Bartolomé Mitre 800')).toBeTruthy()
    expect(screen.getByText('Luján, Buenos Aires')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('sin resultados: "tal cual" acepta lo escrito con el punto de la localidad', async () => {
    stubApi({ localidades: { results: [LUJAN] }, direcciones: { results: [] } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)
    await chooseLujan(user)
    await user.type(screen.getByLabelText('Calle y altura'), 'Calle Rara 12{Enter}')
    expect(await screen.findByText('No encontramos esa dirección.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Usar «Calle Rara 12» tal cual' }))
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Calle Rara 12',
      city: 'Luján',
      province: 'Buenos Aires',
      latitude: -34.57,
      longitude: -59.1,
    })
  })

  it('localidad manual + tal cual: queda sin punto', async () => {
    stubApi({ localidades: { results: [] }, direcciones: { results: [], degraded: true } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)
    await user.type(screen.getByRole('combobox', { name: 'Localidad' }), 'Pueblo Chico')
    await user.click(await screen.findByRole('button', { name: 'Escribirla a mano' }))
    await user.click(screen.getByLabelText('Provincia'))
    await user.click(await screen.findByRole('option', { name: 'Chubut' }))
    await user.type(screen.getByLabelText('Calle y altura'), 'Ruta 3 km 5')
    await user.click(screen.getByRole('button', { name: /Buscar/ }))
    expect(await screen.findByText('No pudimos buscar ahora. Podés usarla tal cual.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /tal cual/ }))
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Ruta 3 km 5',
      city: 'Pueblo Chico',
      province: 'Chubut',
      latitude: null,
      longitude: null,
    })
  })

  it('names: hidden inputs vacíos hasta completar y con los valores después', async () => {
    stubApi({ localidades: { results: [LUJAN] }, direcciones: { results: [MITRE] } })
    const user = userEvent.setup()
    const { container } = render(<Harness onChange={vi.fn()} names />)
    const form = container.querySelector('form') as HTMLFormElement
    expect(Object.fromEntries(new FormData(form))).toEqual({
      address: '',
      city: '',
      province: '',
      latitude: '',
      longitude: '',
    })
    await chooseLujan(user)
    await user.type(screen.getByLabelText('Calle y altura'), 'Mitre 800{Enter}')
    await user.click(await screen.findByRole('button', { name: MITRE.label }))
    await waitFor(() =>
      expect(Object.fromEntries(new FormData(form))).toEqual({
        address: 'Bartolomé Mitre 800',
        city: 'Luján',
        province: 'Buenos Aires',
        latitude: '-34.5701',
        longitude: '-59.1049',
      }),
    )
  })

  it('valor inicial completo arranca en la tarjeta', () => {
    render(
      <Harness
        onChange={vi.fn()}
        initial={{
          address: 'Bartolomé Mitre 800',
          city: 'Luján',
          province: 'Buenos Aires',
          latitude: null,
          longitude: null,
        }}
      />,
    )
    expect(screen.getByText('Luján, Buenos Aires')).toBeTruthy()
    expect(screen.queryByLabelText('Calle y altura')).toBeNull()
  })

  it('usar mi ubicación: completa todo con la calle del GPS', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: -34.57, longitude: -59.1 } } as GeolocationPosition),
      },
      configurable: true,
    })
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: {
              city: 'Luján',
              province: 'Buenos Aires',
              address: 'Bartolomé Mitre 800',
              lat: -34.57,
              lng: -59.1,
            },
          }),
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación actual' }))
    await screen.findByText('Bartolomé Mitre 800')
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Bartolomé Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
      latitude: -34.57,
      longitude: -59.1,
    })
    Reflect.deleteProperty(navigator, 'geolocation')
  })

  it('usar mi ubicación sin altura: pide revisar la calle', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: -34.57, longitude: -59.1 } } as GeolocationPosition),
      },
      configurable: true,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: { city: 'Luján', province: 'Buenos Aires', lat: -34.57, lng: -59.1 },
            }),
          ),
      ),
    )
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación actual' }))
    expect(await screen.findByText('Revisá la calle y la altura.')).toBeTruthy()
    expect(onChange).toHaveBeenLastCalledWith(null)
    Reflect.deleteProperty(navigator, 'geolocation')
  })
})
