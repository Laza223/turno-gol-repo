import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { AssignReferrerPanel, type AssignReferrerAction } from './assign-referrer-panel'

const meta = {
  title: 'SuperAdmin/TenantDetail/AssignReferrerPanel',
  component: AssignReferrerPanel,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    initialReferrerName: null,
    action: fn(
      async () =>
        ({
          success: true as const,
          referrerName: 'Canchas del Sur',
        }) as unknown as ReturnType<AssignReferrerAction>,
    ),
  },
  // En la app real vive dentro del <Card title="Datos del complejo"> — ver resumen-tab.tsx.
  decorators: [
    (Story) => (
      <section className="rounded-lg border border-border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold text-foreground">Datos del complejo</h2>
        <div className="mt-4">
          <Story />
        </div>
      </section>
    ),
  ],
} satisfies Meta<typeof AssignReferrerPanel>

export default meta
type Story = StoryObj<typeof meta>

export const SinReferidorTodavia: Story = {}

export const ConReferidorAsignado: Story = {
  args: { initialReferrerName: 'Canchas del Sur' },
}

export const AsignarOk: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Código o link de referidos')
    await userEvent.type(input, 'https://turnogol.app/r/AH2K9MZP')
    await userEvent.click(canvas.getByRole('button', { name: 'Asignar' }))
    await expect(args.action).toHaveBeenCalledWith({
      tenantId: '00000000-0000-4000-8000-000000000001',
      code: 'https://turnogol.app/r/AH2K9MZP',
    })
    await waitFor(() =>
      expect(canvas.getByText('Referido por: Canchas del Sur')).toBeInTheDocument(),
    )
  },
}

export const ErrorAlAsignar: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'Un complejo no puede ser su propio referidor.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Código o link de referidos')
    await userEvent.type(input, 'AH2K9MZP')
    await userEvent.click(canvas.getByRole('button', { name: 'Asignar' }))
    await waitFor(() =>
      expect(canvas.getByText('Un complejo no puede ser su propio referidor.')).toBeInTheDocument(),
    )
  },
}
