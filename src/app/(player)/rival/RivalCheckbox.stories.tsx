import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { RivalCheckbox } from './RivalCheckbox'

function Demo({ invalid = false }: { invalid?: boolean }) {
  const [checked, setChecked] = useState(false)
  return (
    <div className="space-y-1.5">
      <RivalCheckbox
        name="courtDeclared"
        checked={checked}
        onChange={setChecked}
        invalid={invalid}
        describedBy={invalid ? 'demo-error' : undefined}
      >
        Ya tengo la cancha
      </RivalCheckbox>
      {invalid && (
        <p id="demo-error" className="text-[13px] leading-5 text-red-700 dark:text-red-300">
          Tenés que confirmar que tenés la cancha.
        </p>
      )}
    </div>
  )
}

const meta = {
  title: 'Player/Rival/RivalCheckbox',
  component: RivalCheckbox,
  parameters: { layout: 'padded' },
  args: { checked: false, onChange: () => {}, children: 'Ya tengo la cancha' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RivalCheckbox>

export default meta
type Story = StoryObj<typeof meta>

export const SinMarcar: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('checkbox')).not.toBeChecked()
  },
}

export const Marcada: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox', { name: 'Ya tengo la cancha' })
    await userEvent.click(box)
    await expect(box).toBeChecked()
  },
}

export const ConError: Story = {
  render: () => <Demo invalid />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox')
    await expect(box).toBeInvalid()
    await expect(box).toHaveAccessibleDescription('Tenés que confirmar que tenés la cancha.')
  },
}
