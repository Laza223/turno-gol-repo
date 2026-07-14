import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PerfilImagesForm } from './PerfilImagesForm'

// PNG transparente de 1x1 — suficiente para que <img>.onload dispare de
// verdad en el canvas de resizeToPreset (browser mode real, no jsdom).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function tinyPngFile(name: string): File {
  const bytes = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0))
  return new File([bytes], name, { type: 'image/png' })
}

/** Contenedor real: settings/perfil/page.tsx envuelve el form en `.card-premium`. */
const meta = {
  title: 'Admin/Settings/PerfilImagesForm',
  component: PerfilImagesForm,
  parameters: { layout: 'padded' },
  args: {
    removeImageAction: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Perfil público</h2>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PerfilImagesForm>

export default meta
type Story = StoryObj<typeof meta>

const setImageActionOk = () =>
  fn(async (_kind: 'logo' | 'cover', _fd: FormData) => ({
    success: true as const,
    url: 'https://media.turnogol.com/t1/logo-nuevo.webp',
  }))

export const SinImagenes: Story = {
  args: { logoUrl: null, coverUrl: null, setImageAction: setImageActionOk() },
}

export const ConImagenes: Story = {
  args: {
    logoUrl: 'https://media.turnogol.com/t1/logo-a.webp',
    coverUrl: 'https://media.turnogol.com/t1/cover-a.webp',
    setImageAction: setImageActionOk(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button', { name: /quitar imagen/i })).toHaveLength(2)
  },
}

/** Subir un logo nuevo reemplaza el dropzone vacío por la imagen que devuelve la action. */
export const SubirLogo: Story = {
  args: { logoUrl: null, coverUrl: null, setImageAction: setImageActionOk() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Subí el logo de tu complejo')
    await userEvent.upload(input, tinyPngFile('logo.png'))
    await expect(await canvas.findByRole('button', { name: /quitar imagen/i })).toBeInTheDocument()
    await expect(args.setImageAction).toHaveBeenCalledWith('logo', expect.any(FormData))
  },
}

export const ErrorDeSubida: Story = {
  args: {
    logoUrl: null,
    coverUrl: null,
    setImageAction: fn(async () => ({ success: false as const, error: 'La imagen no puede superar 2MB' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Subí el logo de tu complejo')
    await userEvent.upload(input, tinyPngFile('logo.png'))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('La imagen no puede superar 2MB')
  },
}
