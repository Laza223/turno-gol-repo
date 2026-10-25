import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { RivalFormResult } from './actions'
import { AlertOptIn } from './AlertOptIn'

const tenants = [
  { id: 't1', name: 'El Vagón' },
  { id: 't2', name: 'Open Door' },
]

const meta = {
  title: 'Player/Rival/AlertOptIn',
  component: AlertOptIn,
  parameters: { layout: 'padded' },
  args: {
    tenants,
    signedIn: true,
    subscribed: [],
    action: fn(async (): Promise<RivalFormResult> => ({ success: true })),
    unsubscribeAction: fn(async (): Promise<RivalFormResult> => ({ success: true })),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AlertOptIn>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Solo si buscan arquero')).not.toBeChecked()
    await expect(canvas.getAllByRole('button', { name: 'Avisame cuando haya' })).toHaveLength(1)
  },
}

export const GuardaYConfirma: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Avisame cuando haya' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'Listo, te avisamos por mail. Un mail por día como mucho y podés darte de baja con un toque.',
    )
    await expect(args.action).toHaveBeenCalledTimes(1)
  },
}

export const ConErrorDelServidor: Story = {
  args: {
    action: fn(async (): Promise<RivalFormResult> => ({
      success: false,
      error: 'Elegí un complejo.',
      field: 'tenantId',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Avisame cuando haya' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Elegí un complejo.')
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Avisame cuando haya' })).toBeEnabled(),
    )
  },
}

export const YaSuscripto: Story = {
  args: { subscribed: [{ tenantId: 't1', onlyGoalkeeper: true }] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Avisame de partidos en' }))
    await userEvent.click(
      await within(document.body).findByRole('menuitemradio', { name: 'El Vagón' }),
    )
    await expect(canvas.getByText(/Ya te avisamos de ese complejo/)).toBeInTheDocument()
    // La casilla toma la preferencia guardada.
    await expect(canvas.getByLabelText('Solo si buscan arquero')).toBeChecked()
    // Se puede actualizar la preferencia y también darse de baja desde la sesión.
    await expect(canvas.getByRole('button', { name: 'Actualizar aviso' })).toBeEnabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Dejar de avisarme' }))
    await expect(
      await canvas.findByText('Listo, no te vamos a avisar más de ese complejo.'),
    ).toBeInTheDocument()
    await expect(args.unsubscribeAction).toHaveBeenCalledTimes(1)
  },
}

export const SinSesion: Story = {
  args: { signedIn: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ingresá y activá el aviso' })).toHaveAttribute(
      'href',
      '/ingresar?next=%2Frival',
    )
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}
