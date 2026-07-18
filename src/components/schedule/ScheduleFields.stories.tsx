import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import { deriveScheduleView, type ScheduleView } from '@/app/(admin)/settings/horarios/horarios-lib'
import { openingHours, openingHoursClosesNextDay } from '@/test/fixtures/tenant'
import { ScheduleFields } from './ScheduleFields'

const ADVANCED_TRIGGER_NAME = 'Excepciones y detalles avanzados'

/**
 * Fase 3 UX (progressive disclosure): los días y el checkbox "Cierra después
 * de medianoche" viven colapsados bajo este trigger — pero el panel arranca
 * ABIERTO si la vista ya trae config avanzada (días custom/cerrados o
 * closesNextDay). Idempotente: solo clickea si está colapsado.
 */
async function openAdvanced(canvas: ReturnType<typeof within>) {
  const trigger = canvas.getByRole('button', { name: ADVANCED_TRIGGER_NAME })
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await userEvent.click(trigger)
  }
}

/** Vista sin NINGUNA config avanzada: los 7 días heredan el general. */
function virginView(): ScheduleView {
  const v = deriveScheduleView(openingHours())
  for (const day of Object.keys(v.days) as (keyof ScheduleView['days'])[]) {
    v.days[day] = { mode: 'general', open: v.general.open, close: v.general.close }
  }
  return v
}

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

/**
 * Fase 3 UX (progressive disclosure): los días y "Cierra después de
 * medianoche" arrancan colapsados; "Horario general" queda siempre visible.
 * Click en el trigger los revela.
 */
export const ExcepcionesColapsadasPorDefecto: Story = {
  name: 'Colapsado por defecto — click en "Excepciones y detalles avanzados" las revela',
  // Vista VIRGEN a propósito: el fixture openingHours() trae viernes/domingo
  // custom, y con config avanzada el panel arranca abierto (ver story siguiente).
  render: () => <Controlled initialView={virginView()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Horario general')).toBeVisible()
    // forceMount: los campos quedan en el DOM (deben serializar en FormData
    // aun colapsados) pero no visibles hasta abrir el panel.
    await expect(canvas.getByLabelText(/Lunes abierto/)).not.toBeVisible()
    await expect(canvas.getByLabelText(/^Cierra después de medianoche/)).not.toBeVisible()

    await openAdvanced(canvas)

    await expect(await canvas.findByLabelText(/Lunes abierto/)).toBeVisible()
    await expect(canvas.getByLabelText(/^Cierra después de medianoche/)).toBeVisible()
  },
}

/**
 * Con config avanzada pre-existente (fixture: viernes/domingo custom) el panel
 * arranca ABIERTO: esconder detrás de un click un horario que el dueño ya
 * configuró se leería como "¿dónde se fue mi configuración?".
 */
export const ConfigAvanzadaArrancaAbierta: Story = {
  render: () => <Controlled initialView={deriveScheduleView(openingHours())} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: ADVANCED_TRIGGER_NAME }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByLabelText(/Lunes abierto/)).toBeVisible()
  },
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
    await openAdvanced(canvas)
    // viernes y domingo YA son 'custom' en el fixture (09-24 y 09-22 difieren
    // del general 09-23) — hay 3 "Restablecer" en pantalla. Acotar al <li> de
    // Sábado, que es el día que esta story personaliza.
    const saturdayItem = (await canvas.findByText('Sábado')).closest('li') as HTMLElement
    await expect(
      within(saturdayItem).getByRole('button', { name: 'Restablecer' })
    ).toBeInTheDocument()
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
    await openAdvanced(canvas)
    await expect(await canvas.findByText('Cerrado')).toBeInTheDocument()
    // aria-label real = `${DAY_LABELS_LONG[day]} abierto`, con mayúscula inicial.
    await expect(canvas.getByLabelText('Domingo abierto')).not.toBeChecked()
  },
}

/** Cierra pasada la medianoche sin el flag activado: banner de sugerencia. */
export const HintMadrugada: Story = {
  render: () => (
    <Controlled
      initialView={deriveScheduleView(openingHoursClosesNextDay())}
      initialClosesNextDay={false}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Cerrás pasada la medianoche/)).toBeInTheDocument()
  },
}

/** Con el flag activado: el banner desaparece (el hint ya no aplica). */
export const CierraDespuesDeMedianoche: Story = {
  render: () => (
    <Controlled
      initialView={deriveScheduleView(openingHoursClosesNextDay())}
      initialClosesNextDay
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await openAdvanced(canvas)
    // El <label> nativo envuelve el checkbox + el título + la descripción, así
    // que el nombre accesible completo incluye todo ese texto — se matchea por
    // el inicio.
    await expect(await canvas.findByLabelText(/^Cierra después de medianoche/)).toBeChecked()
    await expect(canvas.queryByText(/Cerrás pasada la medianoche/)).not.toBeInTheDocument()
  },
}

/** Editar el horario general en vivo — los días en modo "general" lo reflejan al instante. */
export const EditarGeneral: Story = {
  render: () => <Controlled initialView={deriveScheduleView(openingHours())} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // input type="time": userEvent.type/keyboard tipea los segmentos visibles
    // del widget nativo (formato dependiente del locale del browser, ambiguo);
    // fireEvent.change setea el .value directo, sin ambigüedad (mismo idiom
    // que AbonadoForm.stories.tsx).
    const closeInput = canvas.getByLabelText('Cierra') as HTMLInputElement
    await fireEvent.change(closeInput, { target: { value: '22:00' } })
    await expect(closeInput).toHaveValue('22:00')
  },
}
