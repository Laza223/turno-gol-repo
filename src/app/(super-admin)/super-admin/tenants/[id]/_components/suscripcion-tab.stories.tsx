import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { within, expect } from 'storybook/test'
import {
  tenantDetail,
  tenantDetailPastDue,
  tenantDetailPendingCourtsChange,
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
  args: { detail: tenantDetail() },
} satisfies Meta<typeof SuscripcionTab>

export default meta
type Story = StoryObj<typeof meta>

/** 5 canchas mensuales: $47.000 la primera + 4 × $30.000 = $167.000/mes. */
export const SuscripcionActiva: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Canchas facturadas')).toBeInTheDocument()
    await expect(canvas.getByText(/167\.000/)).toBeInTheDocument()
  },
}

/** Sin fila en `tenant_subscriptions`: el trial todavía no activó el cobro. */
export const SinSuscripcion: Story = {
  args: { detail: tenantDetailTrialing() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/todavía no inició la/i)).toBeInTheDocument()
  },
}

/** Cambio de canchas agendado para el cierre del período (nunca prorrateado, P4). */
export const CambioDeCanchasPendiente: Story = {
  args: { detail: tenantDetailPendingCourtsChange() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/pasa a 7 canchas/i)).toBeInTheDocument()
  },
}

/** Moroso con dunning en curso — período vencido, último pago fallido. */
export const Moroso: Story = {
  args: { detail: tenantDetailPastDue() },
}
