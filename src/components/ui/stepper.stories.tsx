import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { Stepper } from './stepper'

const STEPS = [
  { n: 1, label: 'Tu complejo', hint: 'Nombre y ubicación' },
  { n: 2, label: 'Horarios', hint: 'Cuándo abrís' },
  { n: 3, label: 'Canchas', hint: 'Canchas y precios' },
  { n: 4, label: 'Primera reserva', hint: 'Probá la grilla' },
] as const

/**
 * La lista de pasos ES el indicador de progreso. Estaba hardcodeada dentro de
 * `WizardShell`; acá queda como primitive para cualquier flujo multi-paso.
 */
const meta = {
  title: 'Design System/Stepper',
  component: Stepper,
  parameters: { layout: 'centered' },
  args: { steps: STEPS, current: 2 },
} satisfies Meta<typeof Stepper>

export default meta
type Story = StoryObj<typeof meta>

/** El paso actual lleva `aria-current="step"`; los anteriores anuncian "(completado)". */
export const EnCurso: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const items = canvas.getAllByRole('listitem')
    await expect(items).toHaveLength(4)
    await expect(items[1]).toHaveAttribute('aria-current', 'step')
    await expect(items[0]).not.toHaveAttribute('aria-current')
    // El estado no se comunica solo con color (MASTER §1.4).
    await expect(within(items[0]!).getByText('(completado)')).toBeInTheDocument()
  },
}

export const PrimerPaso: Story = {
  args: { current: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
  },
}

/** `current` mayor al último paso: todo completado, ningún actual. Es la pantalla de cierre. */
export const TodoCompletado: Story = {
  args: { current: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const items = canvas.getAllByRole('listitem')
    for (const item of items) {
      await expect(item).not.toHaveAttribute('aria-current')
      await expect(within(item).getByText('(completado)')).toBeInTheDocument()
    }
  },
}

export const SinHints: Story = {
  args: {
    steps: [
      { n: 1, label: 'Datos' },
      { n: 2, label: 'Pago' },
      { n: 3, label: 'Confirmación' },
    ],
    current: 2,
  },
}

/**
 * Tono para el rail de marca always-dark. Fondo SÓLIDO a propósito: sobre el
 * gradiente real axe no puede medir contraste y la violación pasa desapercibida
 * (así se coló el `text-slate-600` que el primitive corrige).
 */
export const SobreFondoOscuro: Story = {
  args: { tone: 'on-dark', current: 3 },
  parameters: { backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div className="rounded-xl bg-slate-950 p-8">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step')
  },
}
