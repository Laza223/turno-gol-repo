import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { Coachmark } from './coachmark'

/**
 * Coachmark anclado a un elemento EXTERNO vía `[data-tour-id]` (MASTER §7.3):
 * globo `bg-card border shadow-lg rounded-lg p-3 max-w-[260px]` + flecha +
 * botón ghost "Entendido", sin foco atrapado (`role="status"`, no `dialog`).
 * El decorator renderiza el "ancla" real (cualquier elemento de la pantalla)
 * para que el componente pueda medir su posición con getBoundingClientRect().
 */
const meta = {
  title: 'Design System/Coachmark',
  component: Coachmark,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="relative flex min-h-40 items-start p-10">
        <button
          type="button"
          data-tour-id="demo-target"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Ir a la grilla
        </button>
        <Story />
      </div>
    ),
  ],
  args: {
    targetId: 'demo-target',
    text: 'Abrí la grilla desde acá para cargar y ver los turnos del día.',
    onDismiss: fn(),
  },
} satisfies Meta<typeof Coachmark>

export default meta
type Story = StoryObj<typeof meta>

/** Un solo paso, sin "Omitir recorrido" (onSkip no se pasó). */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('status')).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: 'Entendido' }))
    await expect(args.onDismiss).toHaveBeenCalledOnce()
  },
}

/** Con stepLabel ("1 de 3") y "Omitir recorrido" — caso real dentro de un tour. */
export const ConSkip: Story = {
  args: {
    stepLabel: '1 de 3',
    dismissLabel: 'Siguiente',
    onSkip: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('status')).toBeVisible())
    await expect(body.getByText('1 de 3')).toBeVisible()
    await userEvent.click(body.getByText('Omitir recorrido'))
    await expect(args.onSkip).toHaveBeenCalledOnce()
  },
}

/** `placement="top"`: el globo queda arriba del target (flecha hacia abajo) para no tapar contenido que vive debajo del ancla. */
export const ArribaDelTarget: Story = {
  args: { placement: 'top', stepLabel: '2 de 3', dismissLabel: 'Siguiente' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('status')).toBeVisible())
    await expect(body.getByText('2 de 3')).toBeVisible()
  },
}

/** El target no existe en el DOM: el componente no renderiza nada. */
export const TargetInexistente: Story = {
  args: { targetId: 'no-existe-en-esta-pantalla' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(body.queryByRole('status')).not.toBeInTheDocument()
  },
}
