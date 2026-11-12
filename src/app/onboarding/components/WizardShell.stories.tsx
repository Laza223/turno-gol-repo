import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WizardShell } from './WizardShell'

/**
 * Reproduce el wrapper real de cada paso (pages/onboarding.md §3): el `card-premium
 * rounded-2xl p-6 md:p-8` que envuelve el contenido lo pone el shell.
 *
 * El rail de marca + el indicador de progreso viven en `WizardChrome` (ver su
 * propia story) — `WizardShell` es solo el wrapper de contenido: card centrada.
 */
function StepPlaceholder({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">
        Contenido del paso (ver la story del Step correspondiente).
      </p>
    </div>
  )
}

const meta = {
  title: 'Onboarding/WizardShell',
  component: WizardShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WizardShell>

export default meta
type Story = StoryObj<typeof meta>

export const Basico: Story = {
  args: { children: <StepPlaceholder title="¿Cómo se llama tu complejo?" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible()
  },
}
