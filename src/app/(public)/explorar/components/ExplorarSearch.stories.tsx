import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { ZONA_STORAGE_KEY, markZonaApplied } from '@/lib/zona-storage'
import { cityCounts } from '@/test/fixtures/tenant'
import { withGeolocation } from '@/test/storybook/with-geolocation'
import { withExplorar } from '../../../../../.storybook/decorators/with-explorar'
import ExplorarSearch from './ExplorarSearch'

/** La zona vive en localStorage y el browser de Storybook se comparte entre stories. */
const clearZona = () => localStorage.removeItem(ZONA_STORAGE_KEY)

/** Los tamaños de los complejos de La Plata: 6 con Fútbol 5, 2 con Fútbol 7, 1 con Fútbol 11. */
const LA_PLATA_SETS = [[5], [5], [5, 7], [5, 7], [5], [5, 11]]

const meta = {
  title: 'Player/Explorar/ExplorarSearch',
  component: ExplorarSearch,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/explorar',
        query: { city: 'La Plata', province: 'Buenos Aires', formats: '5' },
      },
    },
  },
  decorators: [withGeolocation('pending'), withExplorar],
  args: { cities: cityCounts(), formatSets: LA_PLATA_SETS },
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  beforeEach: () => {
    clearZona()
    // Entrar con filtros ya cuenta como zona aplicada: la story no navega sola.
    markZonaApplied()
    return clearZona
  },
} satisfies Meta<typeof ExplorarSearch>

export default meta
type Story = StoryObj<typeof meta>

const body = (el: HTMLElement) => within(el.ownerDocument.body)

/** La barra muestra lo que dice la URL. */
export const Barra: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Zona: La Plata. Cambiar' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Cancha: Fútbol 5. Cambiar' }),
    ).toBeInTheDocument()
  },
}

/** En la compu: la barra en una píldora de 560 px. */
export const Compu: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole('search', { name: 'Filtrar canchas' })
    await expect(bar.getBoundingClientRect().width).toBeLessThanOrEqual(560)
  },
}

/**
 * Hoja de Cancha: cuántos complejos tiene cada tamaño, los que no tienen ninguno apagados, y
 * "Ver N complejos" con la unión de lo marcado (los tamaños se pisan, no se suman).
 */
export const HojaDeCancha: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Cancha:/ }))
    const sheet = within(await body(canvasElement).findByRole('dialog'))
    // Cualquier tamaño y Fútbol 5: los seis tienen Fútbol 5.
    await expect(sheet.getAllByText('6 complejos')).toHaveLength(2)
    await expect(sheet.getByText('2 complejos')).toBeInTheDocument()
    await expect(sheet.getByRole('checkbox', { name: /Fútbol 4/ })).toBeDisabled()
    await expect(sheet.getAllByText('Ninguno en La Plata').length).toBeGreaterThan(0)
    await expect(sheet.getByRole('button', { name: 'Ver 6 complejos' })).toBeInTheDocument()

    await userEvent.click(sheet.getByText('Fútbol 5', { exact: true }))
    await userEvent.click(sheet.getByText('Fútbol 11', { exact: true }))
    await expect(sheet.getByRole('button', { name: 'Ver 1 complejo' })).toBeInTheDocument()
    await userEvent.click(sheet.getByRole('button', { name: 'Ver 1 complejo' }))
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        '/explorar?city=La+Plata&province=Buenos+Aires&formats=11',
      ),
    )
  },
}

/** Hoja de Localidad: con texto escrito, una fila busca un complejo por ese nombre, en todas las localidades. */
export const BuscarPorNombre: Story = {
  parameters: { fetchMock: [{ match: '/api/public/geo/localidades', json: { results: [] } }] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Zona:/ }))
    const sheet = within(await body(canvasElement).findByRole('dialog'))
    await userEvent.type(sheet.getByRole('searchbox', { name: 'Zona o ciudad' }), 'Fénix')
    await expect(await sheet.findByText('No encontramos esa zona.')).toBeInTheDocument()
    await userEvent.click(sheet.getByRole('button', { name: /Buscar complejos que se llamen/ }))
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith('/explorar?formats=5&q=F%C3%A9nix'),
    )
  },
}

/** Elegir otra localidad navega en el acto y conserva el tamaño. */
export const ElegirLocalidad: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Zona:/ }))
    const sheet = within(await body(canvasElement).findByRole('dialog'))
    await userEvent.click(sheet.getByText('Córdoba, Córdoba'))
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        '/explorar?city=C%C3%B3rdoba&province=C%C3%B3rdoba&formats=5',
      ),
    )
  },
}
