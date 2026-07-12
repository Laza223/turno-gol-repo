import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { cityCounts } from '@/test/fixtures/tenant'
import SearchBar from './SearchBar'

/** Vive dentro de `.search-card` sobre la banda hero (ver SearchBand). */
const meta = {
  title: 'Player/Explorar/SearchBar',
  component: SearchBar,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  args: { cities: cityCounts() },
  decorators: [(Story) => <div className="player-hero-band max-w-3xl rounded-3xl border p-6"><Story /></div>],
} satisfies Meta<typeof SearchBar>

export default meta
type Story = StoryObj<typeof meta>

/** Campos vacíos: estado inicial de /explorar sin filtros. */
export const CamposVacios: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Buscar')).toHaveValue('')
    await expect(canvas.getByRole('button', { name: /buscar/i })).toBeInTheDocument()
  },
}

/** Precargado desde la URL: query + ciudad + fecha + hora ya elegidos. */
export const Precargado: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/explorar',
        query: { q: 'Fénix', city: 'Córdoba', province: 'Córdoba', date: '2026-03-20', time: '19:00' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Buscar')).toHaveValue('Fénix')
    await expect(canvas.getByRole('button', { name: /^19:00/ })).toBeInTheDocument()
  },
}

/** Ciudad de una URL vieja que ya no está en la lista (tenant suspendido, etc.): se agrega derivada. */
export const CiudadNoListada: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: '/explorar', query: { city: 'Ushuaia', province: 'Tierra del Fuego' } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByDisplayValue('Ushuaia, Tierra del Fuego')).toBeInTheDocument()
  },
}

/** Dropdown de hora abierto: lista de horarios cada 1hs de 08:00 a 23:00. */
export const DropdownDeHoraAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /cualquiera/i }))
    // DropdownMenuContent se porta a document.body (Radix Portal): se busca con `screen`.
    await expect(await screen.findByRole('menuitem', { name: '20:00' })).toBeInTheDocument()
  },
}
