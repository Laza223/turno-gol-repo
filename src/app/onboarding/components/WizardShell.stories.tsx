import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WizardShell } from './WizardShell'

/**
 * Reproduce el wrapper real de cada paso (pages/onboarding.md §3): el
 * page.tsx del wizard envuelve el Step* en `.card-premium rounded-2xl p-6
 * md:p-8` antes de pasarlo como children — sin esa superficie el contenido de
 * ejemplo quedaría sobre `bg-background` y no representa la app real.
 */
function StepPlaceholder({ title }: { title: string }) {
  return (
    <div className="card-premium rounded-2xl p-6 md:p-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">
          Contenido del paso (ver la story del Step correspondiente).
        </p>
      </div>
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

export const Paso1Identidad: Story = {
  args: { currentStep: 1, children: <StepPlaceholder title="Identificá tu complejo" /> },
}

/**
 * Paso 2 (Horarios) usa la columna ancha, igual que Canchas. El título del
 * placeholder NO repite el label del rail ("Horarios") a propósito: si
 * coincidieran, `getByText` sería ambiguo entre el contenido y el nav.
 */
export const Paso2Horarios: Story = {
  args: { currentStep: 2, wide: true, children: <StepPlaceholder title="Cargá tus horarios" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El label aparece dos veces (rail desktop + header mobile): ambos viven
    // en el DOM a la vez, solo uno visible según el viewport vía CSS.
    await expect(canvas.getAllByText('Paso 2 de 4 · 50%').length).toBe(2)
    const current = canvas.getByText('Horarios').closest('li')
    await expect(current).toHaveAttribute('aria-current', 'step')
    const done = canvas.getByText('Tu complejo').closest('li')
    await expect(done).not.toHaveAttribute('aria-current')
  },
}

export const Paso3Canchas: Story = {
  args: { currentStep: 3, wide: true, children: <StepPlaceholder title="Sumá tus canchas" /> },
}

export const Paso4Senas: Story = {
  args: { currentStep: 4, children: <StepPlaceholder title="Elegí cómo cobrar" /> },
}

/** currentStep=5: el wizard ya completó los 4 pasos ("¡Listo!" en vez de "Paso N de 4"). */
export const Listo: Story = {
  args: { currentStep: 5, children: <StepPlaceholder title="¡Tu complejo está online!" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El rail de marca muestra "¡Listo!" tanto en desktop (aside) como en mobile (header).
    await expect(canvas.getAllByText('¡Listo!').length).toBeGreaterThan(0)
  },
}
