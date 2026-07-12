import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import ExplorarToolbar from './ExplorarToolbar'

const meta = {
  title: 'Player/Explorar/ExplorarToolbar',
  component: ExplorarToolbar,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  args: { total: 12 },
} satisfies Meta<typeof ExplorarToolbar>

export default meta
type Story = StoryObj<typeof meta>

/** Vista lista (default) + orden por nombre. */
export const VistaLista: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /lista/i })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('combobox', { name: /ordenar por/i })).toHaveValue('name')
  },
}

/** Vista mapa activa (?view=map): togglear "Mapa" navega escribiendo el param a la URL. */
export const VistaMapa: Story = {
  parameters: { nextjs: { navigation: { pathname: '/explorar', query: { view: 'map' } } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /mapa/i })).toHaveAttribute('aria-pressed', 'true')
  },
}

/** Click en "Mapa" navega con ?view=map preservando el resto de los filtros. */
export const CambiarAVistaMapa: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /mapa/i }))
    await expect(getRouter().push).toHaveBeenCalledWith(expect.stringContaining('view=map'))
  },
}

/** Ordenar por cercanía sin geolocalización disponible: toast de error, sin navegar. */
export const OrdenarPorDistanciaSinGeolocalizacion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const original = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    try {
      await userEvent.selectOptions(canvas.getByRole('combobox', { name: /ordenar por/i }), 'distance')
      // El Toaster porta su contenido a document.body (Radix Portal): se busca
      // con `screen`, no con `canvas` (scoped a canvasElement).
      await expect(await screen.findByText(/no soporta geolocalización/i)).toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true })
    }
  },
}

/** Ordenar por cercanía con geolocalización concedida: navega con lat/lng + sort=distance. */
export const OrdenarPorDistanciaConGeolocalizacion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const original = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: -34.6091, longitude: -58.4416 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition),
      },
    })
    try {
      await userEvent.selectOptions(canvas.getByRole('combobox', { name: /ordenar por/i }), 'distance')
      await expect(getRouter().push).toHaveBeenCalledWith(expect.stringContaining('sort=distance'))
    } finally {
      Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true })
    }
  },
}
