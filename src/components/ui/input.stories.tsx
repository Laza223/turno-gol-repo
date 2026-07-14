import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Input } from './input'

/**
 * `<input>` nativo puro, sin wrapper. Se usa suelto o junto a `Label` dentro
 * de `.card-premium`; el propio input resuelve su contraste vía tokens
 * (`bg-card`, `border-border`) sin depender del fondo del contenedor.
 */
const meta = {
  title: 'Design System/Input',
  component: Input,
  parameters: { layout: 'centered' },
  args: { placeholder: 'Nombre del complejo' },
  decorators: [(Story) => <div className="w-72"><Story /></div>],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ConValor: Story = { args: { defaultValue: 'Complejo San Martín' } }

export const Disabled: Story = { args: { disabled: true, defaultValue: 'No editable' } }

export const TipoFile: Story = { args: { type: 'file' } }

/** Foco visible por teclado (`focus-visible:ring-3` + `border-primary`). */
export const Foco: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText('Nombre del complejo')
    await userEvent.tab()
    await expect(input).toHaveFocus()
  },
}
