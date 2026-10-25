import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { RivalPhotoResult } from '@/app/(player)/rival/photo-actions'
import { PlayerPhotoField } from './PlayerPhotoField'

/** Foto de ejemplo: un SVG en data URI, sin red ni URLs reales. */
const SAMPLE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%2310b981'/><circle cx='32' cy='26' r='12' fill='white'/><rect x='12' y='42' width='40' height='22' rx='11' fill='white'/></svg>"

const ok = async (): Promise<RivalPhotoResult> => ({ success: true, url: null })

const meta = {
  title: 'Components/Rival/PlayerPhotoField',
  component: PlayerPhotoField,
  parameters: { layout: 'padded' },
  args: {
    url: null,
    initials: 'LF',
    uploadAction: fn(async (): Promise<RivalPhotoResult> => ({ success: true, url: SAMPLE })),
    removeAction: fn(ok),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerPhotoField>

export default meta
type Story = StoryObj<typeof meta>

export const Vacia: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('LF')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Subir foto' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
  },
}

export const ConFoto: Story = {
  args: { url: SAMPLE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
    // Blanco táctil de 44 px o más.
    const box = canvas.getByRole('button', { name: 'Quitar' }).getBoundingClientRect()
    await expect(box.height).toBeGreaterThanOrEqual(44)
  },
}

/** Mientras la action responde: spinner sobre el avatar y botones apagados. */
export const Ocupada: Story = {
  args: {
    url: SAMPLE,
    removeAction: fn(() => new Promise<RivalPhotoResult>(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Cambiar foto' })).toBeDisabled())
    await expect(canvasElement.querySelector('.tg-ball-spinner')).not.toBeNull()
  },
}

export const ConError: Story = {
  args: {
    url: SAMPLE,
    removeAction: fn(async (): Promise<RivalPhotoResult> => ({
      success: false,
      error: 'No pudimos quitar la foto. Probá de nuevo en un momento.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Quitar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('No pudimos quitar la foto')
    // La foto sigue y los botones vuelven a andar.
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Quitar' })).toBeEnabled())
  },
}
