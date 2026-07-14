import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { openingHours, pricingSynthetic } from '@/test/fixtures'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { PricingSection, type CourtPricingSource } from './PricingSection'

const HOURS = openingHours()

// openingHours() (la del resto del archivo) tiene horarios reales dispares por
// día (mié cierra 23:00, vie/sáb 24:00, dom 22:00): con esa ventana,
// pricingSynthetic() (franjas 09-18/18-24 lun-vie + 09-24 finde) se recorta
// distinto por día y el resumen queda fragmentado (deja de haber 2 franjas
// "Lun a Vie" limpias). Semana uniforme para las 2 stories que verifican el
// resumen agregado por franja.
const UNIFORM_WEEK: OpeningHours = {
  mon: { open: '09:00', close: '24:00', closed: false },
  tue: { open: '09:00', close: '24:00', closed: false },
  wed: { open: '09:00', close: '24:00', closed: false },
  thu: { open: '09:00', close: '24:00', closed: false },
  fri: { open: '09:00', close: '24:00', closed: false },
  sat: { open: '09:00', close: '24:00', closed: false },
  sun: { open: '09:00', close: '24:00', closed: false },
}

const meta = {
  title: 'Admin/Canchas/PricingSection',
  component: PricingSection,
  parameters: { layout: 'padded' },
  args: {
    openingHours: HOURS,
    initialRules: [],
    otherCourts: [],
    onRulesChange: fn(),
  },
} satisfies Meta<typeof PricingSection>

export default meta
type Story = StoryObj<typeof meta>

/** Cancha nueva sin precios todavía: la plantilla es el primer paso obligado. */
export const SinPreciosTodavia: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin precios todavía. Empezá por la plantilla rápida.')).toBeVisible()
  },
}

export const ConReglasExistentes: Story = {
  args: { openingHours: UNIFORM_WEEK, initialRules: pricingSynthetic().rules },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 2 franjas Lun a Vie (día/noche a distinto precio) + 1 Sáb y Dom (24hs parejo).
    await expect(canvas.getAllByText('Lun a Vie')).toHaveLength(2)
    await expect(canvas.getByText('Sáb y Dom')).toBeVisible()
  },
}

/** Plantilla "Un precio": completa toda la semana con un solo valor. */
export const AplicarPlantillaUniforme: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Precio por turno'), '20000')
    await userEvent.click(canvas.getByRole('button', { name: 'Aplicar a toda la semana' }))

    await expect(canvas.queryByText('Sin precios todavía. Empezá por la plantilla rápida.')).not.toBeInTheDocument()
    await expect(args.onRulesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ price: 2000000 })]),
      { emptyCount: 0 },
    )
  },
}

/** Copiar de otra cancha: un click reemplaza toda la grilla por la fuente elegida. */
export const CopiarDeOtraCancha: Story = {
  args: {
    openingHours: UNIFORM_WEEK,
    otherCourts: [
      { id: '1', name: 'Cancha 1', rules: pricingSynthetic().rules },
    ] satisfies CourtPricingSource[],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Copiar precios de otra cancha:')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Copiar' }))
    await expect(canvas.getAllByText('Lun a Vie')).toHaveLength(2)
  },
}

/** "Ajustar por hora" plegado por defecto (progressive disclosure): un click lo expande. */
export const AjustarPorHoraExpandible: Story = {
  args: { initialRules: pricingSynthetic().rules },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: 'Ajustar por hora' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('table')).toBeVisible()
  },
}

export const SinHorasOperativas: Story = {
  args: {
    openingHours: {
      mon: { open: '00:00', close: '00:00', closed: true },
      tue: { open: '00:00', close: '00:00', closed: true },
      wed: { open: '00:00', close: '00:00', closed: true },
      thu: { open: '00:00', close: '00:00', closed: true },
      fri: { open: '00:00', close: '00:00', closed: true },
      sat: { open: '00:00', close: '00:00', closed: true },
      sun: { open: '00:00', close: '00:00', closed: true },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/configurá los horarios de atención/i)).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ir a horarios' })).toHaveAttribute(
      'href',
      '/settings/horarios',
    )
  },
}
