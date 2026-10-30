import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CategoryQuiz } from './CategoryQuiz'
import s from './landing.module.css'

const meta = {
  title: 'Player/Rival/Landing/CategoryQuiz',
  component: CategoryQuiz,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className={`${s.root} dark dark-surface mx-auto max-w-lg p-4`}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryQuiz>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', { name: '¿Cuánto jugás?' })).toBeVisible()
    await expect(canvas.getByRole('group', { name: '¿Dónde jugaste?' })).toBeVisible()
    await expect(canvas.getByRole('group', { name: '¿Tu puesto?' })).toBeVisible()
    await expect(canvas.getByText('No guardamos tus respuestas.')).toBeVisible()
  },
}

// Picados + 1 vez por semana = Novena; nadie arranca más arriba de Quinta.
export const Resultado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('1 vez por semana'))
    await userEvent.click(canvas.getByLabelText('Picados'))
    await userEvent.click(canvas.getByLabelText('Arquero'))
    await expect(canvas.getByText('Novena?')).toBeVisible()
    await expect(canvas.getByText(/Nadie arranca más arriba de Quinta/)).toBeVisible()
  },
}

export const TechoEnQuinta: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('4 o más'))
    await userEvent.click(canvas.getByLabelText('Federado'))
    await userEvent.click(canvas.getByLabelText('Delantero'))
    await expect(canvas.getByText('Quinta?')).toBeVisible()
  },
}

export const ProbarDeNuevo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('2 o 3'))
    await userEvent.click(canvas.getByLabelText('Liga amateur'))
    await userEvent.click(canvas.getByLabelText('Defensor'))
    await expect(canvas.getByText('Séptima?')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Probar de nuevo' }))
    await expect(canvas.getByLabelText('1 vez por semana')).not.toBeChecked()
    await expect(canvas.getByRole('group', { name: '¿Cuánto jugás?' })).toBeVisible()
  },
}
