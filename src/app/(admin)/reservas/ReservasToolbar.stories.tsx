import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ReservasToolbar } from './ReservasToolbar'

/**
 * usePathname/useRouter/useSearchParams (next/navigation): mockeados por el
 * framework (regla 6), sin mocks propios. La búsqueda tiene debounce de
 * 300ms real (el preview solo congela `Date.now()`/`new Date()`, los timers
 * quedan reales) — los `play` que la ejercitan usan `waitFor` con margen.
 */
const meta = {
  title: 'Admin/Reservas/ReservasToolbar',
  component: ReservasToolbar,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/reservas', query: {} } },
  },
} satisfies Meta<typeof ReservasToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByPlaceholderText('Buscar nombre o nº de reserva')).toHaveValue('')
    await expect(canvas.getByRole('button', { name: 'Vista detallada' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(canvas.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // Sin texto: el botón de limpiar todavía no existe.
    await expect(canvas.queryByRole('button', { name: 'Limpiar búsqueda' })).not.toBeInTheDocument()
  },
}

/** `?vista=compacta` en la URL: el toggle arranca en modo compacto. */
export const VistaCompacta: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/reservas', query: { vista: 'compacta' } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** `?q=` precargado: el input arranca con texto y el botón de limpiar es visible. */
export const ConBusquedaPrevia: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/reservas', query: { q: 'Julián' } } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByPlaceholderText('Buscar nombre o nº de reserva')).toHaveValue('Julián')
    await expect(canvas.getByRole('button', { name: 'Limpiar búsqueda' })).toBeVisible()
  },
}

/** Escribir dispara `router.replace(?q=…)` tras el debounce de 300ms. */
export const Buscar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText('Buscar nombre o nº de reserva')
    await userEvent.type(input, 'Julián')
    await waitFor(
      () =>
        expect(getRouter().replace).toHaveBeenCalledWith('/reservas?q=Juli%C3%A1n', {
          scroll: false,
        }),
      { timeout: 1000 },
    )
  },
}

/** El botón de limpiar vacía el input y navega sin `?q`. */
export const Limpiar: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/reservas', query: { q: 'Julián' } } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Limpiar búsqueda' }))
    await expect(canvas.getByPlaceholderText('Buscar nombre o nº de reserva')).toHaveValue('')
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith('/reservas', { scroll: false }),
    )
  },
}

/** Cambiar a vista compacta navega con `?vista=compacta` (sin debounce). */
export const CambiarADensidadCompacta: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Vista compacta' }))
    await expect(getRouter().replace).toHaveBeenCalledWith('/reservas?vista=compacta', {
      scroll: false,
    })
  },
}
