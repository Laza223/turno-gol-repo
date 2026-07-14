import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ShareActions } from './ShareActions'

/**
 * La Server Action entra por prop (ver comentario en el componente). Vive
 * dentro de `.card-premium rounded-2xl p-6 text-center md:p-8` (ver
 * listo/page.tsx del wizard).
 */
const meta = {
  title: 'Onboarding/Listo/ShareActions',
  component: ShareActions,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-2xl p-6 text-center md:p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    appUrl: 'https://turnogol.app',
    slug: 'complejo-fenix',
    tenantName: 'Complejo Fénix',
    action: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof ShareActions>

export default meta
type Story = StoryObj<typeof meta>

/**
 * `NEXT_PUBLIC_APP_URL` seteado (caso normal en producción): el link público y el
 * mensaje de WhatsApp pre-armado salen listos sin depender de la hidratación.
 */
export const LinkListo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('turnogol.app/c/complejo-fenix')).toBeInTheDocument()

    // CTA primario: WhatsApp con mensaje pre-armado (doc10 §3). Se deja INERTE
    // (no se clickea): es un <a target="_blank"> real, no una Server Action.
    const wa = canvas.getByRole('link', { name: /compartir por whatsapp/i })
    const href = wa.getAttribute('href') ?? ''
    await expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
    await expect(decodeURIComponent(href)).toContain('Complejo Fénix')
    await expect(decodeURIComponent(href)).toContain('https://turnogol.app/c/complejo-fenix')

    await expect(canvas.getByRole('button', { name: /copiar link/i })).toBeEnabled()
  },
}

/** Clipboard disponible: copia directo y marca `public_link_shared` (best-effort). */
export const CopiarLinkConClipboard: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const writeText = fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })

    await userEvent.click(canvas.getByRole('button', { name: /copiar link/i }))

    await expect(await canvas.findByRole('button', { name: /¡copiado!/i })).toBeInTheDocument()
    await expect(writeText).toHaveBeenCalledWith('https://turnogol.app/c/complejo-fenix')
    await waitFor(() => expect(args.action).toHaveBeenCalled())
  },
}

/** Sin Clipboard API (Safari privado, contexto sin HTTPS): fallback a window.prompt. */
export const CopiarLinkSinClipboard: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    // Se stubea por completo (no se deja abrir un diálogo nativo real).
    const prompt = fn()
    window.prompt = prompt as typeof window.prompt

    await userEvent.click(canvas.getByRole('button', { name: /copiar link/i }))

    await waitFor(() =>
      expect(prompt).toHaveBeenCalledWith(
        'Copiá el enlace público:',
        'https://turnogol.app/c/complejo-fenix',
      ),
    )
    await waitFor(() => expect(args.action).toHaveBeenCalled())
  },
}
