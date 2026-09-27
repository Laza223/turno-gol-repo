import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ReferralLinkPanel, type GenerateReferralLinkAction } from './referral-link-panel'

const meta = {
  title: 'SuperAdmin/TenantDetail/ReferralLinkPanel',
  component: ReferralLinkPanel,
  parameters: { layout: 'padded' },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    initialUrl: null,
    action: fn(
      async () =>
        ({
          success: true as const,
          url: 'https://turnogol.app/r/AH2K9MZP',
        }) as unknown as ReturnType<GenerateReferralLinkAction>,
    ),
  },
  // En la app real vive dentro del <Card title="Datos del complejo"> — ver resumen-tab.tsx.
  decorators: [
    (Story) => (
      <section className="rounded-lg border border-border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold text-foreground">Datos del complejo</h2>
        <div className="mt-4">
          <Story />
        </div>
      </section>
    ),
  ],
} satisfies Meta<typeof ReferralLinkPanel>

export default meta
type Story = StoryObj<typeof meta>

export const SinCodigoTodavia: Story = {}

export const ConCodigoExistente: Story = {
  args: { initialUrl: 'https://turnogol.app/r/AH2K9MZP' },
}

export const GenerarYCopiar: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const generateBtn = canvas.getByRole('button', { name: 'Generar link de referidos' })
    await userEvent.click(generateBtn)
    await expect(args.action).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001')
    await waitFor(() =>
      expect(canvas.getByText('https://turnogol.app/r/AH2K9MZP')).toBeInTheDocument(),
    )

    // El browser headless de Vitest niega el permiso de portapapeles: mismo
    // mock que `ShareButton.stories.tsx` (CopiarEnlace).
    const writeText = fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const copyBtn = canvas.getByRole('button', { name: 'Copiar' })
    await userEvent.click(copyBtn)
    await expect(writeText).toHaveBeenCalledWith('https://turnogol.app/r/AH2K9MZP')
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Copiado' })).toBeInTheDocument())
  },
}

export const ErrorAlGenerar: Story = {
  args: {
    action: fn(async () => ({
      success: false as const,
      error: 'No se pudo generar el link de referidos. Probá de nuevo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Generar link de referidos' }))
    await waitFor(() =>
      expect(
        canvas.getByText('No se pudo generar el link de referidos. Probá de nuevo.'),
      ).toBeInTheDocument(),
    )
  },
}
