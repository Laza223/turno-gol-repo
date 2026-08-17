import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { onboardingFunnelData, onboardingFunnelDataEmpty } from '@/test/fixtures/super-admin'
import { OnboardingFunnelSection } from './onboarding-funnel-section'

/**
 * Embudo del wizard de onboarding en /super-admin (Fase 7 del plan de
 * refactor): primera vista que LEE `analytics_events` — hasta acá era
 * write-only.
 */
const meta = {
  title: 'SuperAdmin/Dashboard/OnboardingFunnelSection',
  component: OnboardingFunnelSection,
  parameters: { layout: 'padded' },
  args: { data: onboardingFunnelData() },
} satisfies Meta<typeof OnboardingFunnelSection>

export default meta
type Story = StoryObj<typeof meta>

export const ConDatos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Embudo de onboarding')).toBeInTheDocument()
    await expect(canvas.getByText('Tu complejo')).toBeInTheDocument()
    await expect(canvas.getByText(/mediana 1\.5d/)).toBeInTheDocument()
  },
}

/** Sin actividad de onboarding en la ventana: empty state en vez de una barra al 0%. */
export const SinActividad: Story = {
  args: { data: onboardingFunnelDataEmpty() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Sin actividad de onboarding en la ventana/)).toBeInTheDocument()
  },
}
