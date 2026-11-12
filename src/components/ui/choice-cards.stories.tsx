import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ChoiceCards, type ChoiceOption } from './choice-cards'

const INTAKE: readonly ChoiceOption<string>[] = [
  { value: 'notebook', label: 'En un cuaderno o planilla' },
  { value: 'whatsapp', label: 'Por WhatsApp' },
  { value: 'other_app', label: 'Con otra app' },
  { value: 'new', label: 'Recién abro' },
]

function Controlled({
  options,
  columns,
  initial = null,
}: {
  options: readonly ChoiceOption<string>[]
  columns?: 1 | 2
  initial?: string | null
}) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <div className="max-w-md p-4">
      <ChoiceCards
        aria-label="¿Cómo tomás los turnos hoy?"
        options={options}
        columns={columns}
        value={value}
        onChange={setValue}
      />
    </div>
  )
}

const meta = {
  title: 'UI/ChoiceCards',
  component: ChoiceCards,
  parameters: { layout: 'centered' },
  args: {
    options: INTAKE,
    value: null,
    onChange: fn(),
    'aria-label': '¿Cómo tomás los turnos hoy?',
  },
} satisfies Meta<typeof ChoiceCards>

export default meta
type Story = StoryObj<typeof meta>

/** Tocar una opción la marca; las demás quedan sin marcar. */
export const ElegirUna: Story = {
  render: () => <Controlled options={INTAKE} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const radios = canvas.getAllByRole('radio')
    await expect(radios).toHaveLength(4)
    for (const radio of radios) await expect(radio).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(canvas.getByRole('radio', { name: 'Por WhatsApp' }))
    await expect(canvas.getByRole('radio', { name: 'Por WhatsApp' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await userEvent.click(canvas.getByRole('radio', { name: 'Recién abro' }))
    await expect(canvas.getByRole('radio', { name: 'Por WhatsApp' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  },
}

/** Sí / No en dos columnas, con una respuesta ya elegida (revisita). */
export const SiNo: Story = {
  render: () => (
    <Controlled
      columns={2}
      initial="no"
      options={[
        { value: 'yes', label: 'Sí' },
        { value: 'no', label: 'No' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true')
  },
}
