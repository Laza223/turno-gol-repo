import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { openingHours, pricingSynthetic } from '@/test/fixtures'
import { PricingSection, type CourtPricingSource } from './PricingSection'

const HOURS = openingHours()

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
  args: { initialRules: pricingSynthetic().rules },
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
