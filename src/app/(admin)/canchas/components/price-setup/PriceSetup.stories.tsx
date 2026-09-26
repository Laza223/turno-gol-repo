import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { pricingFlat, pricingSynthetic } from '@/test/fixtures'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { PricingRule } from '@/modules/courts/court.types'
import { PriceSetup, type CourtPricingSource } from './PriceSetup'

const open = (o: string, c: string) => ({ open: o, close: c, closed: false })
const closed = { open: '00:00', close: '00:00', closed: true }

/** El Vagón: lunes a viernes de 08 a 01, sábados de 08 a 22, domingos cerrado. */
const VAGON: OpeningHours = {
  mon: open('08:00', '01:00'),
  tue: open('08:00', '01:00'),
  wed: open('08:00', '01:00'),
  thu: open('08:00', '01:00'),
  fri: open('08:00', '01:00'),
  sat: open('08:00', '22:00'),
  sun: closed,
}

/** Semana pareja de 09 a 24: pricingSynthetic() entra entera en las dos preguntas. */
const UNIFORM_WEEK: OpeningHours = {
  mon: open('09:00', '24:00'),
  tue: open('09:00', '24:00'),
  wed: open('09:00', '24:00'),
  thu: open('09:00', '24:00'),
  fri: open('09:00', '24:00'),
  sat: open('09:00', '24:00'),
  sun: open('09:00', '24:00'),
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

/** Tres franjas en el día: no entran en las dos preguntas. */
const THREE_BANDS: PricingRule[] = [
  { days: [...WEEKDAYS], from: '09:00', to: '14:00', price: 7000000 },
  { days: [...WEEKDAYS], from: '14:00', to: '19:00', price: 9000000 },
  { days: [...WEEKDAYS], from: '19:00', to: '24:00', price: 11000000 },
  { days: ['sat', 'sun'], from: '09:00', to: '24:00', price: 10000000 },
]

const meta = {
  title: 'Admin/Canchas/PriceSetup',
  component: PriceSetup,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      // Vive dentro de la tarjeta de CourtForm: se prueba sobre esa superficie.
      <div className="max-w-2xl rounded-xl border border-border bg-card p-5">
        <Story />
      </div>
    ),
  ],
  args: {
    openingHours: UNIFORM_WEEK,
    closesNextDay: false,
    initialRules: [],
    otherCourts: [],
    onRulesChange: fn(),
  },
} satisfies Meta<typeof PriceSetup>

export default meta
type Story = StoryObj<typeof meta>

/** Cancha nueva: una sola pregunta a la vista, el precio del turno; la semana marca lo que falta. */
export const CanchaNueva: Story = {
  args: { openingHours: VAGON, closesNextDay: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Precio del turno')).toBeVisible()
    await expect(canvas.getByText('Falta el precio del turno: cargalo arriba.')).toBeVisible()
    await expect(canvas.getAllByText('Cerrado')).toHaveLength(1)
  },
}

/** Un precio para todo: se tipea y la semana queda completa, sin botón de "aplicar". */
export const UnSoloPrecio: Story = {
  args: { openingHours: VAGON, closesNextDay: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Precio del turno'), '84000')
    await expect(canvas.queryByText(/sin precio/)).not.toBeInTheDocument()
    await expect(args.onRulesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ price: 8400000 })]),
      { emptyCount: 0 },
    )
  },
}

/** Día y noche: la respuesta "Sí" abre el corte y un precio para cada lado. */
export const DiaYNoche: Story = {
  args: { openingHours: VAGON, closesNextDay: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const night = within(canvas.getByRole('radiogroup', { name: '¿Cobrás distinto a la noche?' }))
    await userEvent.click(night.getByRole('radio', { name: 'Sí' }))
    await userEvent.type(canvas.getByLabelText('Precio hasta las 18:00'), '60000')
    // Con la mitad cargada, el aviso ya cuenta las horas que faltan.
    await expect(canvas.getByText(/^Faltan \d+ horas sin precio/)).toBeVisible()
    await userEvent.type(canvas.getByLabelText('Precio desde las 18:00'), '84000')
    await expect(canvas.queryByText(/sin precio/)).not.toBeInTheDocument()
  },
}

/** Precios ya cargados que entran en las preguntas: se leen como respuestas. */
export const ConPreciosCargados: Story = {
  args: { initialRules: pricingSynthetic().rules },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const night = within(canvas.getByRole('radiogroup', { name: '¿Cobrás distinto a la noche?' }))
    await expect(night.getByRole('radio', { name: 'Sí' })).toBeChecked()
    await expect(canvas.getByRole('button', { name: 'Sáb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      (canvas.getByLabelText('Precio Lun a Vie hasta las 18:00') as HTMLInputElement).value,
    ).toMatch(/9\.000/)
  },
}

/** "Igual que…": las canchas con el mismo precio son UNA opción; un toque copia y queda marcado. */
export const IgualQueOtraCancha: Story = {
  args: {
    otherCourts: [
      { id: '1', name: 'Cancha 1', rules: pricingSynthetic().rules },
      { id: '2', name: 'Cancha 2', rules: pricingSynthetic().rules },
      { id: '3', name: 'Cancha 3', rules: pricingFlat().rules },
    ] satisfies CourtPricingSource[],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button', { name: /Igual que/ })).toHaveLength(2)
    const same = canvas.getByRole('button', { name: /Igual que Cancha 1 y Cancha 2/ })
    await userEvent.click(same)
    await expect(same).toHaveAttribute('aria-pressed', 'true')
    // Mismos precios (el orden y "24:00" vs "00:00" los decide la compresión).
    await expect(args.onRulesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining(
        [900000, 1300000, 1500000].map((price) => expect.objectContaining({ price })),
      ),
      { emptyCount: 0 },
    )
  },
}

/** "Ajustar hora por hora" plegado por defecto: un click muestra la grilla. */
export const AjustarHoraPorHora: Story = {
  args: { initialRules: pricingSynthetic().rules },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /Ajustar hora por hora/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('table')).toBeVisible()
  },
}

/** Tres franjas no entran en las preguntas: se muestran como están, sin pisarlas. */
export const HoraPorHora: Story = {
  args: { initialRules: THREE_BANDS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/se ajusta hora por hora/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Pasar a un precio simple' })).toBeVisible()
    await expect(
      canvas.queryByRole('radiogroup', { name: '¿Cobrás distinto a la noche?' }),
    ).not.toBeInTheDocument()
  },
}

/** Horas sin precio en una cancha vieja: se completan al abrir y se avisa cuántas. */
export const CompletaHuecosAlAbrir: Story = {
  args: {
    initialRules: [{ days: ['sat'], from: '09:00', to: '24:00', price: 1500000 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(/Completamos \d+ horas/)
  },
}

export const SinHorasOperativas: Story = {
  args: {
    openingHours: {
      mon: closed,
      tue: closed,
      wed: closed,
      thu: closed,
      fri: closed,
      sat: closed,
      sun: closed,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Primero cargá los horarios del complejo/)).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ir a horarios' })).toHaveAttribute(
      'href',
      '/settings/horarios',
    )
  },
}
