import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SubmitButton } from './submit-button'

/**
 * SubmitButton lee `pending` de `useFormStatus()` (react-dom), así que solo tiene
 * sentido dentro de un <form action={…}>. Es además el canario del setup: en
 * `react-dom@18.3.1` `useFormStatus` NO existe — solo lo trae la copia vendorizada
 * de Next (`next/dist/compiled/react-dom`), a la que `@storybook/nextjs-vite`
 * aliasea. Si esta story renderiza, el alias funciona.
 */
const meta = {
  title: 'Design System/SubmitButton',
  component: SubmitButton,
  parameters: { layout: 'centered' },
  args: { children: 'Guardar cambios' },
} satisfies Meta<typeof SubmitButton>

export default meta
type Story = StoryObj<typeof meta>

/** La acción resuelve al instante: el botón nunca se ve en pending. */
export const Default: Story = {
  decorators: [
    (Story) => (
      <form action={() => Promise.resolve()}>
        <Story />
      </form>
    ),
  ],
}

/** La acción nunca resuelve → `pending` queda fijo en true tras el submit. */
export const Enviando: Story = {
  args: { pendingLabel: 'Guardando…' },
  decorators: [
    (Story) => (
      <form action={() => new Promise<void>(() => {})}>
        <Story />
      </form>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar cambios' }))
    const pending = await canvas.findByRole('button', { name: 'Guardando…' })
    await expect(pending).toBeDisabled()
    await expect(pending).toHaveAttribute('aria-busy', 'true')
  },
}

export const Destructivo: Story = {
  args: { children: 'Eliminar cuenta', variant: 'destructive', pendingLabel: 'Eliminando…' },
  decorators: [
    (Story) => (
      <form action={() => Promise.resolve()}>
        <Story />
      </form>
    ),
  ],
}
