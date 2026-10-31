import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ReferralPanel, type GenerateReferralLinkAction } from './ReferralPanel'

const generateAction: GenerateReferralLinkAction = fn(async () => ({ success: true as const }))

const meta = {
  title: 'Settings/ReferralPanel',
  component: ReferralPanel,
  parameters: { layout: 'padded' },
  args: {
    url: 'https://turnogol.app/r/AH2K9MZP',
    tenantName: 'Complejo Demo',
    referrals: [],
    months: 0,
    generateAction,
  },
} satisfies Meta<typeof ReferralPanel>

export default meta
type Story = StoryObj<typeof meta>

const d = (iso: string) => new Date(iso)

export const ConInvitados: Story = {
  args: {
    referrals: [
      {
        id: '1',
        name: 'Canchas del Sur',
        createdAt: d('2026-10-20T15:00:00Z'),
        rewardStatus: null,
      },
      {
        id: '2',
        name: 'Complejo La Bombonera Chica',
        createdAt: d('2026-10-15T15:00:00Z'),
        rewardStatus: 'earned',
      },
      {
        id: '3',
        name: 'Fútbol 5 Norte',
        createdAt: d('2026-10-10T15:00:00Z'),
        rewardStatus: 'manual_pending',
      },
      { id: '4', name: 'Los Pibes', createdAt: d('2026-10-05T15:00:00Z'), rewardStatus: 'applied' },
      {
        id: '5',
        name: 'El Potrero',
        createdAt: d('2026-10-03T15:00:00Z'),
        rewardStatus: 'rejected',
      },
      {
        id: '6',
        name: 'Cancha Extra',
        createdAt: d('2026-10-01T15:00:00Z'),
        rewardStatus: 'over_cap',
      },
    ],
    months: 3,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('3 de 6 meses')).toBeInTheDocument()
    await expect(canvas.getByText('Aprobado')).toBeInTheDocument()
  },
}

export const Vacio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0 de 6 meses')).toBeInTheDocument()
    await expect(canvas.getByText(/Todavía no invitaste a nadie/)).toBeInTheDocument()
  },
}

export const SinLink: Story = {
  args: { url: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Generar mi link' }))
    await waitFor(() => expect(args.generateAction).toHaveBeenCalledOnce())
  },
}

export const VerCondiciones: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Ver condiciones' })).toHaveAttribute(
      'href',
      '/terminos#referidos',
    )
  },
}
