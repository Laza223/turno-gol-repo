import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { tenantSettings } from '@/test/fixtures/tenant'
import { AvisosForm } from './AvisosForm'

/**
 * La Server Action entra por prop (ver el comentario en AvisosForm.tsx):
 * './actions' es `'use server'` y arrastra node:async_hooks al bundle.
 */
const meta = {
  title: 'Admin/Settings/AvisosForm',
  component: AvisosForm,
  parameters: { layout: 'padded' },
  args: {
    s: tenantSettings(),
    action: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Avisos</h2>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AvisosForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * MEJORA-UX QA: los 2 toggles eran `<button>` sueltos sin `role`/`aria-checked`
 * — un lector de pantalla no podía saber cuál estaba activo. Ahora es un
 * `radiogroup` real (Radix) con roving tabindex.
 */
export const ToggleEsUnRadiogroupAccesible: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const email = canvas.getByRole('radio', { name: 'Recibir por email' })
    const push = canvas.getByRole('radio', { name: 'Solo push' })
    await expect(canvas.getByRole('radiogroup')).toBeInTheDocument()
    // Default de la fixture: sin opt-in de email → "Solo push" activo.
    await expect(push).toHaveAttribute('aria-checked', 'true')
    await expect(email).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(email)
    await expect(email).toHaveAttribute('aria-checked', 'true')
    await expect(push).toHaveAttribute('aria-checked', 'false')
  },
}
