import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import s from './landing.module.css'
import { VoyDemo } from './VoyDemo'

const meta = {
  title: 'Player/Rival/Landing/VoyDemo',
  component: VoyDemo,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className={`${s.root} dark dark-surface mx-auto max-w-lg p-4`}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VoyDemo>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Falta 1')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /sumarme al partido|ya estás en el partido/ }),
    ).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.queryByRole('button', { name: 'Reiniciar' })).not.toBeInTheDocument()
  },
}

export const TocarVoy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: /sumarme al partido|ya estás en el partido/ }),
    )
    await expect(canvas.getByText(/¡Estamos los 10!/)).toBeVisible()
    await expect(canvas.getByText('Se juega')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /sumarme al partido|ya estás en el partido/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: 'Reiniciar' })).toBeVisible()
  },
}

export const Reiniciar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: /sumarme al partido|ya estás en el partido/ }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Reiniciar' }))
    await expect(canvas.getByText('Falta 1')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /sumarme al partido|ya estás en el partido/ }),
    ).toHaveFocus()
  },
}
