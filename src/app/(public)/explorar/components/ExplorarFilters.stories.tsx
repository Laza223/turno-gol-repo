import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import ExplorarFilters from './ExplorarFilters'

const meta = {
  title: 'Player/Explorar/ExplorarFilters',
  component: ExplorarFilters,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof ExplorarFilters>

export default meta
type Story = StoryObj<typeof meta>

/** Sin filtros activos: estado inicial del panel. */
export const SinFiltros: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: /techado/i })).not.toBeChecked()
  },
}

/** Con techado/superficie/formato/servicios/online precargados desde la URL. */
export const ConFiltrosActivos: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/explorar',
        query: {
          surfaces: 'synthetic_grass',
          formats: '5,7',
          amenities: 'techado,estacionamiento',
          online: '1',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: /techado/i })).toBeChecked()
    await expect(canvas.getByRole('checkbox', { name: /sintético/i })).toBeChecked()
    await expect(canvas.getByRole('button', { name: 'Fútbol 5' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('checkbox', { name: /solo con reserva online/i })).toBeChecked()
  },
}

/** Precio mínimo > máximo: error de validación bloquea el "Aplicar filtros". */
export const ErrorDePrecio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Precio mínimo'), '50000')
    await userEvent.type(canvas.getByLabelText('Precio máximo'), '10000')
    await userEvent.click(canvas.getByRole('button', { name: 'Aplicar filtros' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no puede superar el máximo/i)
  },
}

/** "Aplicar filtros" navega escribiendo los filtros a la URL. */
export const AplicarFiltros: Story = {
  args: { onApplied: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('checkbox', { name: /techado/i }))
    await userEvent.click(canvas.getByRole('button', { name: 'Aplicar filtros' }))
    await expect(args.onApplied).toHaveBeenCalledTimes(1)
    await expect(getRouter().push).toHaveBeenCalledWith(expect.stringContaining('amenities=techado'))
  },
}
