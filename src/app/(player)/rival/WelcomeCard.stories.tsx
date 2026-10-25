import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { RivalFormResult } from './actions'
import type { RivalPhotoResult } from './photo-actions'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { WelcomeCard } from './WelcomeCard'

const meta = {
  title: 'Player/Rival/WelcomeCard',
  component: WelcomeCard,
  parameters: { layout: 'padded' },
  args: {
    defaultName: 'Lazaro',
    action: fn(async (): Promise<RivalFormResult> => ({ success: true })),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WelcomeCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
    await expect(canvas.getByText('Llegá a horario.')).toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: 'Aceptar y seguir' })).toHaveLength(1)
    // El clickwrap de la spec §7, debajo del botón.
    await expect(canvas.getByText(/Al tocar, aceptás las reglas de RIVAL/)).toBeInTheDocument()
    // Sin la prop `photo` la tarjeta no ofrece foto.
    await expect(canvas.queryByRole('button', { name: 'Subir foto' })).not.toBeInTheDocument()
  },
}

export const ConErrorDelServidor: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Elegí tu zona',
      field: 'zone',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Aceptar y seguir' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Elegí tu zona')
    // El form no se resetea: el nombre sigue y el botón se puede volver a tocar.
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Aceptar y seguir' })).toBeEnabled(),
    )
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
  },
}

const PHOTO = {
  url: null,
  uploadAction: fn(async (): Promise<RivalPhotoResult> => ({ success: true, url: null })),
  removeAction: fn(async (): Promise<RivalPhotoResult> => ({ success: true, url: null })),
}

/** Con storage configurado: la foto opcional entre el nombre y la posición. */
export const ConFoto: Story = {
  args: { photo: PHOTO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tu foto (opcional)')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Subir foto' })).toBeInTheDocument()
    // Subir la foto no envía el form: el botón que acepta sigue siendo uno solo.
    await expect(canvas.getAllByRole('button', { name: 'Aceptar y seguir' })).toHaveLength(1)
  },
}

export const ConFotoCargada: Story = {
  args: {
    photo: {
      ...PHOTO,
      url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='%2310b981'/></svg>",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
  },
}

export const ConPerfilPrevio: Story = {
  args: { defaultPosition: 'goalkeeper', defaultZone: 'Luján' },
  play: async ({ canvasElement }) => {
    // Re-aceptación por cambio de reglas: posición y zona ya cargadas llegan precargadas.
    await expect(canvasElement.querySelector('input[name="position"]')).toHaveValue('goalkeeper')
    await expect(canvasElement.querySelector('[name="zone"]')).toHaveValue('Luján')
  },
}
