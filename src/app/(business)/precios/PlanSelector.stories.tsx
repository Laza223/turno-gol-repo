import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import PlanSelector from './PlanSelector'

/** Vive en la sección "Planes" de /precios, sobre el fondo oscuro fijo (`(business)/layout.tsx`). */
const meta = {
  title: 'Public/Precios/PlanSelector',
  component: PlanSelector,
  parameters: { layout: 'padded', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[1240px] text-slate-300" style={{ background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlanSelector>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Estado inicial: 3 canchas → plan **Predio** activo, ciclo mensual.
 *
 * Desde la migr. 071 el corte de Predio es 1-3 canchas (era 1-2), alineado con
 * los tramos de ATC. Este assert antes buscaba `heading: 'Complejo'` y **pasaba
 * igual con el plan activo cambiado**, porque las tres cards renderizan su
 * heading siempre: verificaba que el plan EXISTA, no que esté activo. Ahora usa
 * el mismo marcador que PlanPredio/PlanEstadio ("tu plan es X"), que sí depende
 * de `planForCourts`.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: '3', checked: true })).toBeInTheDocument()
    await expect(canvas.getByText('Para tus canchas')).toBeInTheDocument()
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('Predio')
  },
}

/** 4-6 canchas → Complejo. */
export const PlanComplejo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '4' }))
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('Complejo')
  },
}

/** 1 cancha → Predio (borde inferior del mismo tramo que el default). */
export const PlanPredio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '1' }))
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('Predio')
  },
}

/** 8+ canchas → Estadio (canchas ilimitadas). */
export const PlanEstadio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '8+' }))
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('Estadio')
  },
}

/**
 * Ciclo anual: precio tachado + "Ahorrás $X al año".
 *
 * El "Ahorrás" se renderiza en las TRES cards, no solo en la activa — el
 * comentario anterior decía "en la card activa" y eso nunca fue cierto. El
 * assert apunta al de Predio, el plan activo con las 3 canchas del default:
 * ($63.000 − $50.400) × 12 = $151.200.
 *
 * `formatArs` separa "$" del monto con un espacio NO-BREAK (U+00A0) — `\s` en
 * el regex lo cubre, un espacio literal no.
 */
export const CicloAnual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: /anual/i }))
    await expect(canvas.getByText(/ahorrás \$\s?151\.200 al año/i)).toBeInTheDocument()
  },
}
