import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { PlusToggle, type SetTenantPlusAction } from './plus-toggle'

const meta = {
  title: 'SuperAdmin/TenantDetail/PlusToggle',
  component: PlusToggle,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    initialEnabled: false,
    action: fn(
      async () =>
        ({
          success: true as const,
          message: 'Actualizado',
        }) as unknown as ReturnType<SetTenantPlusAction>,
    ),
  },
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
} satisfies Meta<typeof PlusToggle>

export default meta
type Story = StoryObj<typeof meta>

export const Desactivado: Story = {
  args: { initialEnabled: false },
}

export const Activado: Story = {
  args: { initialEnabled: true },
}

export const ToggleSuccess: Story = {
  args: { initialEnabled: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const switchBtn = canvas.getByRole('switch', { name: /turnogol plus/i })
    await expect(switchBtn).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(switchBtn)
    await expect(args.action).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', true)
    await waitFor(() => expect(canvas.getByText('Activado')).toBeInTheDocument())
  },
}

export const ToggleError: Story = {
  args: {
    initialEnabled: false,
    action: fn(async () => ({
      success: false as const,
      error: 'No se pudo actualizar TurnoGol Plus.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchBtn = canvas.getByRole('switch', { name: /turnogol plus/i })
    await userEvent.click(switchBtn)
    await waitFor(() =>
      expect(canvas.getByText('No se pudo actualizar TurnoGol Plus.')).toBeInTheDocument(),
    )
    await expect(canvas.getByText('Desactivado')).toBeInTheDocument()
  },
}
