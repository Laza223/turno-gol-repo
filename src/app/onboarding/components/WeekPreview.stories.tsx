import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { openingHours, openingHoursClosesNextDay } from '@/test/fixtures/tenant'
import { deriveScheduleView } from '@/lib/schedule/schedule-view'
import { WeekPreview } from './WeekPreview'

const meta = {
  title: 'Onboarding/WeekPreview',
  component: WeekPreview,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WeekPreview>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Horario típico saneado: una barra por día, todas dentro del mismo eje.
 * `openingHours()` da lun-jue 09-23 (el par más frecuente → "general", 4 días),
 * vie/sáb 09-24 y dom 09-22 (quedan "custom", cada uno con su propio par).
 */
export const HorarioTipico: Story = {
  args: { view: deriveScheduleView(openingHours()), closesNextDay: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tu semana')).toBeInTheDocument()
    await expect(canvas.getAllByText('09:00–23:00')).toHaveLength(4)
    await expect(canvas.getAllByText('09:00–24:00')).toHaveLength(2) // vie + sáb
    await expect(canvas.getByText('09:00–22:00')).toBeInTheDocument()
    await expect(canvas.queryByText('Cerrado')).not.toBeInTheDocument()
  },
}

/** Un día cerrado: barra vacía + "Cerrado" en vez de un rango horario. */
export const ConDiaCerrado: Story = {
  args: {
    view: deriveScheduleView({
      ...openingHours(),
      sun: { open: '09:00', close: '22:00', closed: true },
    }),
    closesNextDay: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cerrado')).toBeInTheDocument()
  },
}

/**
 * Cierre pasada la medianoche (viernes/sábado 02:00, día operativo): la barra
 * de esos días se extiende MÁS ALLÁ de las 24:00 del eje — la única forma de
 * ver un horario de madrugada sin leer dos inputs y hacer la cuenta mental.
 */
export const CierraDespuesDeMedianoche: Story = {
  args: { view: deriveScheduleView(openingHoursClosesNextDay()), closesNextDay: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El texto muestra la hora de pared tal como se tipeó (02:00, viernes y
    // sábado), no el minuto continuo interno (26:00) que usa la barra.
    await expect(canvas.getAllByText('09:00–02:00')).toHaveLength(2)
  },
}
