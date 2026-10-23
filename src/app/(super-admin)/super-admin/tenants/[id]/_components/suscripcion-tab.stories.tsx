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

/** 5 canchas mensuales: $30.000 × 5 = $150.000/mes. */
export const SuscripcionActiva: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Canchas facturadas')).toBeInTheDocument()
    await expect(canvas.getByText(/150\.000/)).toBeInTheDocument()
  },
}

/**
 * F7a: con Plus facturado la pestaña muestra la parte de Plus, así las líneas
 * cierran con la cuota: 2 canchas = 1ª $30.000 + 1 × $30.000 + Plus 2 × $15.000 = $90.000.
 */
export const ConPlusFacturado: Story = {
  args: {
    detail: (() => {
      const base = tenantDetail()
      return tenantDetail({
        subscription: {
          ...base.subscription!,
          billedCourts: 2,
          plusEnabled: true,
          plusPricePerCourtCents: 1_500_000,
        },
      })
    })(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Plus: 2 canchas × .*15\.000/)).toBeInTheDocument()
    await expect(canvas.getByText(/90\.000/)).toBeInTheDocument()
  },
}

/** Sin Plus no aparece ninguna línea de Plus. */
export const SinPlusNoMuestraLinea: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Plus:/)).not.toBeInTheDocument()
  },
}

/** Sin fila en `tenant_subscriptions`: el trial todavía no activó el cobro. */
export const SinSuscripcion: Story = {
  args: { detail: tenantDetailTrialing() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/todavía no inició la suscripción/i)).toBeInTheDocument()
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
