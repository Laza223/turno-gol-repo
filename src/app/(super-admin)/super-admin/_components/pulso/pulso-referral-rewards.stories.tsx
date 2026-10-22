import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { ReferralRewardForReview } from '@/modules/referrals/referral-reward.service'
import { PulsoReferralRewards } from './pulso-referral-rewards'

/**
 * "Premios de referidos" del Pulso (B3). Las tres actions entran por prop:
 * `../../actions` es `'use server'` y arrastra el gateway de MP si se importa
 * como valor.
 */
const ganado: ReferralRewardForReview = {
  referredTenantId: '00000000-0000-4000-8000-000000000011',
  referredName: 'Fútbol Norte',
  status: 'earned',
  statusAt: new Date('2026-11-24T15:00:00Z'),
  referrerTenantId: '00000000-0000-4000-8000-000000000001',
  referrerName: 'El Vagón',
  referrerStatus: 'trialing',
  referrerTrialEndsAt: new Date('2026-12-06T03:00:00Z'),
}

const pendienteManual: ReferralRewardForReview = {
  referredTenantId: '00000000-0000-4000-8000-000000000012',
  referredName: 'La Canchita de Pepe',
  status: 'manual_pending',
  statusAt: new Date('2026-11-26T15:00:00Z'),
  referrerTenantId: '00000000-0000-4000-8000-000000000002',
  referrerName: 'Complejo Fénix',
  referrerStatus: 'active',
  referrerTrialEndsAt: null,
}

const ok = () => fn(async () => ({ success: true as const, message: 'Listo.' }))

const meta = {
  title: 'SuperAdmin/Pulso/PremiosDeReferidos',
  component: PulsoReferralRewards,
  parameters: { layout: 'padded' },
  args: {
    rewards: [ganado, pendienteManual],
    actions: { approve: ok(), markApplied: ok(), reject: ok() },
  },
} satisfies Meta<typeof PulsoReferralRewards>

export default meta
type Story = StoryObj<typeof meta>

export const GanadoYPendiente: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Premios de referidos')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Ya lo devolví' })).toBeInTheDocument()
    await expect(canvas.getByText(/cuenta master/)).toBeInTheDocument()
  },
}

/** Sin premios para revisar la sección no se dibuja. */
export const SinPremios: Story = {
  args: { rewards: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Premios de referidos')).toBeNull()
  },
}

/** Aprobar pasa por el ConfirmDialog y llama a la action con los dos complejos. */
export const ApruebaConConfirmacion: Story = {
  args: { rewards: [ganado] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Aprobar' }))
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('heading', { name: /aprobar el mes de "el vagón"/i })
    await expect(body.getByText(/su prueba se extiende 30 días sola/)).toBeInTheDocument()
    await userEvent.click(body.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() =>
      expect(args.actions.approve).toHaveBeenCalledWith(
        ganado.referredTenantId,
        ganado.referrerTenantId,
      ),
    )
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

/** Doble click desde otra pestaña: el error del CAS se ve en el diálogo. */
export const YaProcesado: Story = {
  args: {
    rewards: [pendienteManual],
    actions: {
      approve: ok(),
      reject: ok(),
      markApplied: fn(async () => ({
        success: false as const,
        error: 'Este premio ya se había procesado. Recargá para ver cómo quedó.',
      })),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Ya lo devolví' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Sí, ya lo devolví' }))
    await expect(await body.findByText(/ya se había procesado/)).toBeInTheDocument()
  },
}
