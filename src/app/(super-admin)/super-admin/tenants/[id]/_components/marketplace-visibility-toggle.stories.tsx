import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import {
  MarketplaceVisibilityToggle,
  type UpdateMarketplaceVisibilityAction,
} from './marketplace-visibility-toggle'

const meta = {
  title: 'SuperAdmin/TenantDetail/MarketplaceVisibilityToggle',
  component: MarketplaceVisibilityToggle,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    initialVisible: true,
    action: fn(
      async () =>
        ({
          success: true as const,
          message: 'Actualizado',
        }) as unknown as ReturnType<UpdateMarketplaceVisibilityAction>,
    ),
  },
} satisfies Meta<typeof MarketplaceVisibilityToggle>

export default meta
type Story = StoryObj<typeof meta>

export const Visible: Story = {
  args: { initialVisible: true },
}

export const Oculto: Story = {
  args: { initialVisible: false },
}

export const ToggleSuccess: Story = {
  args: { initialVisible: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const switchBtn = canvas.getByRole('switch', { name: /visibilidad en marketplace público/i })
    await expect(switchBtn).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(switchBtn)
    await expect(args.action).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', false)
    await waitFor(() => expect(canvas.getByText('Oculto')).toBeInTheDocument())
  },
}

export const ToggleError: Story = {
  args: {
    initialVisible: true,
    action: fn(async () => ({
      success: false as const,
      error: 'Error al actualizar visibilidad.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchBtn = canvas.getByRole('switch', { name: /visibilidad en marketplace público/i })
    await userEvent.click(switchBtn)
    await waitFor(() =>
      expect(canvas.getByText('Error al actualizar visibilidad.')).toBeInTheDocument(),
    )
    // Se revierte a Visible
    await expect(canvas.getByText('Visible')).toBeInTheDocument()
  },
}
