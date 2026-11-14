import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { ZONA_STORAGE_KEY } from '@/lib/zona-storage'
import { cityCounts } from '@/test/fixtures/tenant'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
import HeroSearch from './HeroSearch'

/** La zona vive en localStorage y el browser de Storybook se comparte entre stories: arrancar y dejar limpio. */
const clearZona = () => localStorage.removeItem(ZONA_STORAGE_KEY)

/**
 * La conexión no dice nada (fuera del país o sin datos). Va en todas las stories del archivo:
 * `useIpZona` guarda la respuesta a nivel de módulo. La localidad por IP se prueba en
 * `Public/Landing/Hero`.
 */
const SIN_ZONA_POR_IP = { match: '/api/public/zona', json: { zona: null } }

const LA_PLATA = JSON.stringify({ city: 'La Plata', province: 'Buenos Aires' })

const meta = {
  title: 'Public/HeroSearch',
  component: HeroSearch,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
    fetchMock: [SIN_ZONA_POR_IP],
  },
  decorators: [withPortalGlass()],
  args: { cities: cityCounts() },
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  beforeEach: () => {
    clearZona()
    return clearZona
  },
} satisfies Meta<typeof HeroSearch>

export default meta
type Story = StoryObj<typeof meta>

const body = (el: HTMLElement) => within(el.ownerDocument.body)

/** Primera visita: sin zona, el campo pregunta "¿Dónde?" y los dos campos dan 44 px o más. */
export const PrimeraVisita: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const localidad = canvas.getByRole('button', { name: 'Localidad: ¿Dónde?. Cambiar' })
    const cancha = canvas.getByRole('button', { name: 'Cancha: Todas. Cambiar' })
    for (const campo of [localidad, cancha]) {
      await expect(campo.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
  },
}

/** En la compu: una sola píldora con los dos campos y el botón. */
export const Compu: Story = {
  decorators: [withGeolocation('pending')],
  globals: { viewport: { value: 'desktop', isRotated: false } },
}

/** La hoja de Localidad: busca entre las localidades con complejos y lo elegido queda guardado. */
export const HojaLocalidad: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Localidad:/ }))
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Elegí la localidad' })
    const buscar = within(hoja).getByRole('searchbox', { name: 'Localidad' })
    // 16 px o más: iOS no hace zoom al enfocar.
    await expect(parseFloat(getComputedStyle(buscar).fontSize)).toBeGreaterThanOrEqual(16)
    await userEvent.type(buscar, 'cór')
    await expect(within(hoja).getAllByRole('radio')).toHaveLength(2) // "Todas" + Córdoba
    await userEvent.click(within(hoja).getByRole('radio', { name: /Córdoba, Córdoba/ }))
    await waitFor(() => expect(body(canvasElement).queryByRole('dialog')).toBeNull())
    await expect(canvas.getByRole('button', { name: 'Localidad: Córdoba. Cambiar' })).toBeVisible()
    await expect(JSON.parse(localStorage.getItem(ZONA_STORAGE_KEY) ?? '{}')).toMatchObject({
      city: 'Córdoba',
      province: 'Córdoba',
    })
  },
}

/** Una búsqueda sin resultados lo dice, en vez de dejar la lista vacía. */
export const LocalidadSinResultados: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Localidad:/ }))
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Elegí la localidad' })
    await userEvent.type(within(hoja).getByRole('searchbox'), 'Ushuaia')
    await waitFor(() =>
      expect(within(hoja).getByText('No encontramos esa localidad')).toBeVisible(),
    )
  },
}

/** Zona guardada: el campo sale lleno y la hoja no ofrece volver a ubicarse. */
export const ZonaGuardada: Story = {
  decorators: [withGeolocation('pending')],
  beforeEach: () => {
    localStorage.setItem(ZONA_STORAGE_KEY, LA_PLATA)
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const campo = await canvas.findByRole('button', { name: 'Localidad: La Plata. Cambiar' })
    await userEvent.click(campo)
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Elegí la localidad' })
    // `waitFor`: la hoja recién abierta puede estar todavía entrando.
    await waitFor(() =>
      expect(within(hoja).getByText('Tu zona guardada. Cambiala cuando quieras.')).toBeVisible(),
    )
    await expect(within(hoja).getByRole('radio', { name: /La Plata, Buenos Aires/ })).toBeChecked()
    await expect(
      within(hoja).queryByRole('button', { name: 'Usar mi ubicación exacta' }),
    ).toBeNull()
  },
}

/** "Usar mi ubicación exacta" con permiso: elige la ciudad del complejo más cercano y la guarda. */
export const UsarMiUbicacion: Story = {
  decorators: [withGeolocation('found')],
  parameters: {
    fetchMock: [
      SIN_ZONA_POR_IP,
      {
        match: '/api/public/search',
        json: { results: [{ city: 'La Plata', province: 'Buenos Aires', distanceKm: 8 }] },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Localidad:/ }))
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Elegí la localidad' })
    await userEvent.click(within(hoja).getByRole('button', { name: 'Usar mi ubicación exacta' }))
    await waitFor(() =>
      expect(within(hoja).getByText('Tu zona guardada. Cambiala cuando quieras.')).toBeVisible(),
    )
    await expect(within(hoja).getByRole('radio', { name: /La Plata, Buenos Aires/ })).toBeChecked()
  },
}

/** Ubicación denegada: lo dice y deja elegir a mano, sin insistir con el botón. */
export const GeolocalizacionDenegada: Story = {
  decorators: [withGeolocation('denied')],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Localidad:/ }))
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Elegí la localidad' })
    await userEvent.click(within(hoja).getByRole('button', { name: 'Usar mi ubicación exacta' }))
    await waitFor(() =>
      expect(
        within(hoja).getByText(
          'No pudimos acceder a tu ubicación. Elegí tu localidad manualmente.',
        ),
      ).toBeVisible(),
    )
    await expect(
      within(hoja).queryByRole('button', { name: 'Usar mi ubicación exacta' }),
    ).toBeNull()
  },
}

/** La hoja de Cancha: se marcan varios tamaños y "Buscar canchas" lleva a /explorar con ellos. */
export const HojaCancha: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Cancha:/ }))
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Tamaño de cancha' })
    await expect(within(hoja).getByRole('checkbox', { name: 'Cualquier tamaño' })).toBeChecked()
    await userEvent.click(within(hoja).getByRole('checkbox', { name: 'Fútbol 7' }))
    await userEvent.click(within(hoja).getByRole('checkbox', { name: 'Fútbol 5' }))
    await expect(within(hoja).getByRole('checkbox', { name: 'Cualquier tamaño' })).not.toBeChecked()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Buscar canchas' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/explorar?formats=5%2C7')
  },
}

/** "Borrar" vuelve a "Cualquier tamaño". En la compu la hoja es un panel centrado. */
export const HojaCanchaCompu: Story = {
  decorators: [withGeolocation('pending')],
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Cancha:/ }))
    const hoja = await body(canvasElement).findByRole('dialog', { name: 'Tamaño de cancha' })
    await userEvent.click(within(hoja).getByRole('checkbox', { name: 'Fútbol 8' }))
    await userEvent.click(within(hoja).getByRole('button', { name: 'Borrar' }))
    await expect(within(hoja).getByRole('checkbox', { name: 'Cualquier tamaño' })).toBeChecked()
  },
}

/** Sin nada elegido, buscar es pedir todas las canchas. */
export const Buscar: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar canchas' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/explorar')
  },
}
