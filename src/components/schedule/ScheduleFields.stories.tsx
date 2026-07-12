import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { deriveScheduleView, type ScheduleView } from '@/app/(admin)/settings/horarios/horarios-lib'
import { openingHours, openingHoursClosesNextDay } from '@/test/fixtures/tenant'
import { ScheduleFields } from './ScheduleFields'

/**
 * Totalmente controlado (`view`/`onViewChange`, `closesNextDay`/`onClosesNextDayChange`):
 * se reproduce con un wrapper de estado local, igual que el form real de
 * /settings/horarios y el wizard de onboarding (StepSchedule).
 */
function Controlled({
  initialView,
  initialClosesNextDay = false,
}: {
  initialView: ScheduleView
  initialClosesNextDay?: boolean
}) {
  const [view, setView] = useState(initialView)
  const [closesNextDay, setClosesNextDay] = useState(initialClosesNextDay)
  return (
    <div className="space-y-4">
      <ScheduleFields
        view={view}
        onViewChange={setView}
        closesNextDay={closesNextDay}
        onClosesNextDayChange={setClosesNextDay}
      />
    </div>
  )
}

const meta = {
  title: 'Admin/Settings/ScheduleFields',
  component: ScheduleFields,
  parameters: { layout: 'padded' },
  // Los 4 props son requeridos y cada story usa `render` con su propio wrapper
  // controlado — este default solo satisface el tipo de `args` (CSF3 lo exige
  // cuando el componente no tiene props opcionales); el render real ignora estos valores.
  args: {
    view: deriveScheduleView(openingHours()),
    onViewChange: () => {},
    closesNextDay: false,
    onClosesNextDayChange: () => {},
  },
} satisfies Meta<typeof ScheduleFields>

export default meta
type Story = StoryObj<typeof meta>

/** Horario típico (09-23, viernes/sábado hasta medianoche): todos los días heredan el general. */
export const Default: Story = {
  render: () => <Controlled initialView={deriveScheduleView(openingHours())} />,
}

/** Personalizando un día: "Restablecer" vuelve a heredar el general. */
export const DiaPersonalizado: Story = {
  render: () => {
    const view = deriveScheduleView(openingHours())
    view.days.sat = { mode: 'custom', open: '10:00', close: '23:00' }
    return <Controlled initialView={view} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Restablecer' })).toBeInTheDocument()
  },
}

/** Domingo cerrado: checkbox destildado + badge "Cerrado". */
export const DiaCerrado: Story = {
  render: () => {
    const view = deriveScheduleView(openingHours())
    view.days.sun = { mode: 'closed', open: view.days.sun!.open, close: view.days.sun!.close }
    return <Controlled initialView={view} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cerrado')).toBeInTheDocument()
    await expect(canvas.getByLabelText('domingo abierto')).not.toBeChecked()
  },
}

/** Cierra pasada la medianoche sin el flag activado: banner de sugerencia. */
export const HintMadrugada: Story = {
  render: () => <Controlled initialView={deriveScheduleView(openingHoursClosesNextDay())} initialClosesNextDay={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Cerrás pasada la medianoche/)).toBeInTheDocument()
  },
}

/** Con el flag activado: el banner desaparece (el hint ya no aplica). */
export const CierraDespuesDeMedianoche: Story = {
  render: () => <Controlled initialView={deriveScheduleView(openingHoursClosesNextDay())} initialClosesNextDay />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Cierra después de medianoche')).toBeChecked()
    await expect(canvas.queryByText(/Cerrás pasada la medianoche/)).not.toBeInTheDocument()
  },
}

/** Editar el horario general en vivo — los días en modo "general" lo reflejan al instante. */
export const EditarGeneral: Story = {
  render: () => <Controlled initialView={deriveScheduleView(openingHours())} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const closeInput = canvas.getByLabelText('Cierra') as HTMLInputElement
    await userEvent.click(closeInput)
    await userEvent.keyboard('2200')
    await expect(closeInput).toHaveValue('22:00')
  },
}
