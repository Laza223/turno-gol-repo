import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
import { ThemeButton } from './ThemeButton'

/**
 * El botón de tema del portal de vidrio: pasa de claro a oscuro y vuelve, y el tema nuevo se abre
 * en círculo desde el botón. El nombre dice lo que hace ("Cambiar a tema oscuro"), no el estado.
 */
const meta = {
  title: 'Design System/ThemeButton',
  component: ThemeButton,
  parameters: { layout: 'centered' },
  decorators: [withPortalGlass()],
  args: { className: 'glass' },
} satisfies Meta<typeof ThemeButton>

export default meta
type Story = StoryObj<typeof meta>

/** 44 px de blanco táctil. Un toque cambia el tema y el segundo lo devuelve. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const html = canvasElement.ownerDocument.documentElement
    const startedDark = html.classList.contains('dark')
    const button = canvas.getByRole('button', {
      name: startedDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
    })
    await expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await userEvent.click(button)
    await waitFor(() => expect(html.classList.contains('dark')).toBe(!startedDark))
    // El preview fija el tema también en un contenedor (`<div class="dark">`), así que el nombre
    // solo se puede comprobar arrancando en claro: ahí la clase de `html` es la única.
    if (!startedDark) {
      await expect(button).toHaveAccessibleName('Cambiar a tema claro')
    }
    await userEvent.click(button)
    await waitFor(() => expect(html.classList.contains('dark')).toBe(startedDark))
  },
}
