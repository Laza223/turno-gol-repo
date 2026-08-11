import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { within, expect } from 'storybook/test'
import {
  planSummaries,
  tenantDetail,
  tenantDetailPastDue,
  tenantDetailTrialing,
} from '@/test/fixtures/super-admin'
import { SuscripcionTab } from './suscripcion-tab'

/**
 * Tab "Suscripción". Mismo fixture estructural que ResumenTab — ver el
 * comentario ahí sobre por qué no se importa `TenantDetail` directamente.
 */
const meta = {
  title: 'SuperAdmin/TenantDetail/SuscripcionTab',
  component: SuscripcionTab,
  parameters: { layout: 'padded' },
  args: { detail: tenantDetail(), plans: planSummaries() },
} satisfies Meta<typeof SuscripcionTab>

export default meta
type Story = StoryObj<typeof meta>

export const SuscripcionActiva: Story = {}

/** Sin fila en `tenant_subscriptions`: el trial todavía no eligió/pagó un plan. */
export const SinSuscripcion: Story = {
  args: { detail: tenantDetailTrialing() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/todavía no inició la/i)).toBeInTheDocument()
  },
}

/** Moroso con dunning en curso — período vencido, último pago fallido. */
export const Moroso: Story = {
  args: { detail: tenantDetailPastDue() },
}
