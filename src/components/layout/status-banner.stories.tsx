import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { daysFromNow } from '@/test/fixtures/clock'
import { StatusBanner } from './status-banner'

/**
 * `serviceDegraded` es un override SOLO para Storybook/tests (ver el
 * comentario en status-banner.tsx): en la app real nadie la pasa, el default
 * sigue leyendo `NEXT_PUBLIC_SERVICE_DEGRADED` — la única forma de forzar ese
 * estado sin una env var estática a nivel de build de Vite.
 */
const meta = {
  title: 'Admin/Layout/StatusBanner',
  component: StatusBanner,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StatusBanner>

export default meta
type Story = StoryObj<typeof meta>

export const ServicioDegradado: Story = {
  args: { tenantStatus: 'active', trialEndsAt: null, periodEnd: null, serviceDegraded: true },
}

export const Trialing: Story = {
  args: { tenantStatus: 'trialing', trialEndsAt: daysFromNow(9).toISOString(), periodEnd: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/9.*días restantes/)).toBeInTheDocument()
  },
}

/** Singular: "1 día restante" (no "1 días restantes"). */
export const TrialingUnDia: Story = {
  args: { tenantStatus: 'trialing', trialEndsAt: daysFromNow(1).toISOString(), periodEnd: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/1.*día restante\./)).toBeInTheDocument()
  },
}

export const PastDue: Story = {
  args: { tenantStatus: 'past_due', trialEndsAt: null, periodEnd: daysFromNow(2).toISOString() },
}

export const Suspended: Story = {
  args: { tenantStatus: 'suspended', trialEndsAt: null, periodEnd: null },
}

/** `active` sin trial/past_due/suspended: no renderiza nada (`null`). */
export const Activo: Story = {
  args: { tenantStatus: 'active', trialEndsAt: null, periodEnd: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toBeEmptyDOMElement()
  },
}
