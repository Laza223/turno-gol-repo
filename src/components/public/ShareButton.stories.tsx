import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import ShareButton from './ShareButton'

/** `useToast` requiere el `<Toaster/>` montado — ya está global en el preview. */
const meta = {
  title: 'Public/ShareButton',
  component: ShareButton,
  parameters: { layout: 'centered' },
  args: {
    url: 'https://turnogol.app/complejo-fenix',
    message: 'Reservá en Complejo Fénix',
  },
} satisfies Meta<typeof ShareButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const MenuAbierto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Compartir' }))
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(body.getByRole('menuitem', { name: /copiar enlace/i })).toBeVisible(),
    )
    await expect(body.getByRole('menuitem', { name: /whatsapp/i })).toBeVisible()
  },
}

/** Copiar enlace: ícono pasa a check + label "Copiado" + toast de éxito. */
export const CopiarEnlace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: fn(async () => {}) },
      configurable: true,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Compartir' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('menuitem', { name: /copiar enlace/i }))
    await waitFor(() => expect(body.getByText('Enlace copiado')).toBeInTheDocument())
  },
}
