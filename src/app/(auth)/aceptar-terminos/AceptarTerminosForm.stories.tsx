import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { AceptarTerminosForm } from './AceptarTerminosForm'

/**
 * La Server Action entra por prop. El decorator pone el mismo marco que /aceptar-terminos
 * (page.tsx): el mundo del portal, el logo arriba y la columna.
 */
const meta = {
  title: 'Auth/AceptarTerminosForm',
  component: AceptarTerminosForm,
  args: { next: '/mis-reservas' },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalAuthFrame>
        <Story />
      </PortalAuthFrame>
    ),
  ],
} satisfies Meta<typeof AceptarTerminosForm>

export default meta
type Story = StoryObj<typeof meta>

export const SinError: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox')).not.toBeChecked()
    await expect(canvas.getByRole('checkbox')).not.toHaveAttribute('aria-invalid')
    await expect(canvas.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    // El rótulo se lee entero, sin link adentro: tocar el texto tilda la casilla y no navega.
    await expect(canvas.getByRole('checkbox')).toHaveAccessibleName(
      'Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).',
    )
    // Los términos se leen desde un link aparte, con el mismo destino y en la misma pestaña.
    const terms = canvas.getByRole('link', { name: 'Leer los términos y condiciones' })
    await expect(terms).toHaveAttribute('href', '/terminos')
    await expect(terms).not.toHaveAttribute('target')
    await expect(terms.closest('label')).toBeNull()
    await canvasElement.ownerDocument.fonts.ready
    await expect(terms.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  },
}

/** Sin la casilla el botón sigue habilitado: el error se marca en la casilla y dice qué falta. */
export const ConError: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      message: 'Tenés que aceptar los términos.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Tenés que aceptar los términos.',
    )
    await expect(canvas.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByRole('checkbox')).toHaveAccessibleDescription(
      'Tenés que aceptar los términos.',
    )
  },
}
