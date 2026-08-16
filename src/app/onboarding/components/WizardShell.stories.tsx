import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WizardShell } from './WizardShell'

/**
 * Reproduce el wrapper real de cada paso (pages/onboarding.md §3): el `card-premium
 * rounded-2xl p-6 md:p-8` que envuelve el contenido lo pone el shell.
 *
 * El rail de marca + el indicador de progreso YA NO viven acá (Fase 6, se
 * mudaron a `WizardChrome` — ver su propia story) — `WizardShell` es hoy solo
 * el wrapper de contenido: card centrada, o split con `PreviewPane` cuando
 * hay `preview`.
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

function PreviewPlaceholder({ label }: { label: string }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Vista previa (ver PublicCardPreview/WeekPreview/GridPreview).
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

export const SinPreview: Story = {
  args: { children: <StepPlaceholder title="Identificá tu complejo" /> },
}

/**
 * Con `preview`, el layout pasa a split (columna derecha en desktop, barra
 * sticky colapsable en mobile — ver PreviewPane). El título del placeholder NO
 * repite el label del preview a propósito: si coincidieran, `getByText` sería
 * ambiguo entre el contenido y el panel.
 */
export const ConPreview: Story = {
  args: {
    previewTitle: 'Tu semana',
    preview: <PreviewPlaceholder label="Tu semana" />,
    children: <StepPlaceholder title="Cargá tus horarios" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Cargá tus horarios' })).toBeVisible()
    // El preview se renderiza dos veces (aside desktop + panel mobile dentro
    // de PreviewPane): uno visible por viewport vía CSS.
    await expect(canvas.getAllByText('Tu semana').length).toBeGreaterThan(0)
  },
}
