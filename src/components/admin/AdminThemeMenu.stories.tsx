import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AdminThemeMenu } from './AdminThemeMenu'

/**
 * `useTheme()` de next-themes: el preview global ya envuelve TODA story en un
 * `NextThemeProvider` (ver `.storybook/preview.tsx`) — un segundo provider acá
 * adentro sería un no-op (next-themes detecta el contexto ya presente y no
 * aplica sus propios props). Los estados de ícono (Sun/Monitor/Moon) se
 * demuestran vía interacción real sobre el `ThemeToggle` embebido en el
 * dropdown, que sí muta el estado del provider real — no dependen del valor
 * INICIAL del tema (persistido en localStorage entre stories del mismo
 * browser context), por eso cada `play` fuerza su propio estado con un click
 * antes de afirmar nada.
 */
const meta = {
  title: 'Admin/Layout/AdminThemeMenu',
  component: AdminThemeMenu,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AdminThemeMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DropdownAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar tema' }))
    const body = within(canvasElement.ownerDocument.body)
    // findByText solo espera a que el nodo EXISTA; el panel todavía puede estar
    // a mitad de la animación `animate-in` (opacity/scale) en ese instante, así
    // que la visibilidad se reintenta aparte con waitFor.
    await waitFor(() => expect(body.getByText('Tema')).toBeVisible())
    await expect(body.getByRole('radiogroup', { name: 'Tema de la aplicación' })).toBeVisible()
  },
}

export const SeleccionaOscuro: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar tema' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('radio', { name: 'Oscuro' }))
    await expect(body.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}

export const SeleccionaSistema: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cambiar tema' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('radio', { name: 'Sistema' }))
    await expect(body.getByRole('radio', { name: 'Sistema' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}
