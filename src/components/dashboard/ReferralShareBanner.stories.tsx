import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ReferralShareBanner, type DismissReferralBannerAction } from './ReferralShareBanner'

const dismissAction: DismissReferralBannerAction = fn(async () => ({ success: true as const }))

const meta = {
  title: 'Dashboard/ReferralShareBanner',
  component: ReferralShareBanner,
  parameters: { layout: 'padded' },
  args: {
    url: 'https://turnogol.app/r/AH2K9MZP',
    tenantName: 'Complejo Demo',
    dismissAction,
  },
} satisfies Meta<typeof ReferralShareBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Copiar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // El browser headless de Vitest niega el permiso de portapapeles: mismo
    // mock que `referral-link-panel.stories.tsx` (GenerarYCopiar). Se define
    // ANTES del click.
    const writeText = fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    await userEvent.click(canvas.getByRole('button', { name: 'Copiar link' }))
    await expect(writeText).toHaveBeenCalledWith('https://turnogol.app/r/AH2K9MZP')
    await waitFor(() => expect(canvas.getByText('Copiado')).toBeInTheDocument())
  },
}

export const Cerrar: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cerrar aviso de referidos' }))
    await expect(args.dismissAction).toHaveBeenCalledOnce()
    // Optimista: desaparece al instante, sin esperar la persistencia.
    await waitFor(() => expect(canvas.queryByRole('note')).not.toBeInTheDocument())
  },
}

export const HrefDeWhatsapp: Story = {
  name: 'El link de WhatsApp incluye el mensaje y la URL',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const waLink = canvas.getByRole('link', { name: /WhatsApp/ })
    const href = waLink.getAttribute('href') ?? ''
    await expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    const message = decodeURIComponent(href.replace('https://wa.me/?text=', ''))
    await expect(message).toContain('Complejo Demo')
    await expect(message).toContain('https://turnogol.app/r/AH2K9MZP')
  },
}

export const VerCondiciones: Story = {
  name: 'Ver condiciones lleva a la sección de referidos de los términos',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Ver condiciones' })
    await expect(link).toHaveAttribute('href', '/terminos#referidos')
    await expect(link).toHaveAttribute('target', '_blank')
  },
}
