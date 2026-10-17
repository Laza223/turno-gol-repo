import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { onboardingFunnelData, onboardingFunnelDataEmpty } from '@/test/fixtures/super-admin'
import { OnboardingFunnelSection } from './onboarding-funnel-section'

/** Embudo del asistente de alta de complejos, en el Pulso. */
const meta = {
  title: 'SuperAdmin/Pulso/OnboardingFunnelSection',
  component: OnboardingFunnelSection,
  parameters: { layout: 'padded' },
  args: { data: onboardingFunnelData() },
} satisfies Meta<typeof OnboardingFunnelSection>

export default meta
type Story = StoryObj<typeof meta>

export const ConDatos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Alta de complejos/)).toBeInTheDocument()
    await expect(canvas.getByText('Tu complejo')).toBeInTheDocument()
    await expect(canvas.getByText(/mediana 1,5 días/)).toBeInTheDocument()
  },
}

/** Sin altas en el período: texto en vez de una barra al 0 %. */
export const SinActividad: Story = {
  args: { data: onboardingFunnelDataEmpty() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Sin altas en el período/)).toBeInTheDocument()
  },
}

/** La lectura falló o venció. */
export const NoDisponible: Story = {
  args: { data: null },
}
