import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Draft } from './constants'
import { CourtDraftCard } from './CourtDraftCard'

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  key: 1,
  name: 'Cancha 1',
  format: 5,
  surfaceType: 'synthetic_grass',
  isCovered: false,
  priceCents: 2000000,
  ...overrides,
})

/**
 * Vive dentro del <form> del paso 3, a su vez dentro de `.card-premium` (ver
 * page.tsx del wizard).
 */
const meta = {
  title: 'Onboarding/StepCourts/CourtDraftCard',
  component: CourtDraftCard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-2xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    index: 0,
    canRemove: true,
    onToggle: fn(),
    onUpdate: fn(),
    onRemove: fn(),
  },
} satisfies Meta<typeof CourtDraftCard>

export default meta
type Story = StoryObj<typeof meta>

export const Colapsado: Story = {
  args: { draft: draft(), isExpanded: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('$ 20.000')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /editar/i }))
    await expect(args.onToggle).toHaveBeenCalledWith(1)
  },
}

/** Sin precio cargado: la fila-resumen avisa "(falta precio)" en vez del monto. */
export const PrecioVacio: Story = {
  args: { draft: draft({ priceCents: null }), isExpanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('(falta precio)')).toBeInTheDocument()
  },
}

/** Techada: el resumen suma "· Techada" a formato y superficie. */
export const Techada: Story = {
  args: { draft: draft({ isCovered: true }), isExpanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Fútbol 5 · Césped sintético · Techada/)).toBeInTheDocument()
  },
}

/** Única cancha del wizard: no se puede quitar (no hay a qué volver). */
export const SinPermisoDeQuitar: Story = {
  args: { draft: draft(), isExpanded: false, canRemove: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText(/quitar/i)).not.toBeInTheDocument()
  },
}

export const Expandido: Story = {
  args: { draft: draft(), isExpanded: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText('Nombre *'), 'X')
    await expect(args.onUpdate).toHaveBeenCalledWith(1, { name: 'Cancha 1X' })

    await userEvent.click(canvas.getByRole('radio', { name: 'Fútbol 7' }))
    await expect(args.onUpdate).toHaveBeenCalledWith(1, { format: 7 })

    await userEvent.click(canvas.getByRole('checkbox', { name: 'Techada' }))
    await expect(args.onUpdate).toHaveBeenCalledWith(1, { isCovered: true })

    await userEvent.click(canvas.getByRole('button', { name: 'Listo' }))
    await expect(args.onToggle).toHaveBeenCalledWith(1)
  },
}

/**
 * La tarjeta ya no pide foto: el uploader que vivía acá subía a R2 y el submit
 * del paso descartaba el resultado. Se cargan desde `/settings/canchas`, contra
 * la cancha real.
 */
export const SinUploaderDeFoto: Story = {
  args: { draft: draft(), isExpanded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText('Subir foto')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/foto de la cancha/i)).not.toBeInTheDocument()
  },
}
