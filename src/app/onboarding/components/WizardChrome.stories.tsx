import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WizardChrome } from './WizardChrome'

function StepPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
    </div>
  )
}

/**
 * El rail de marca + el indicador de progreso (Fase 6, antes vivían adentro de
 * `WizardShell`): acá quedaron porque `layout.tsx` es lo único que Next.js
 * mantiene MONTADO al navegar entre pasos, condición necesaria para que la
 * barra de progreso pueda animar ENTRE pasos.
 *
 * `usePathname` sale del mock estándar de next/navigation del framework
 * (`parameters.nextjs.navigation`), igual que `AdminSidebar`.
 */
const meta = {
  title: 'Onboarding/WizardChrome',
  component: WizardChrome,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WizardChrome>

export default meta
type Story = StoryObj<typeof meta>

export const Paso2 = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/onboarding/horarios' } } },
  args: { children: <StepPlaceholder title="Cargá tus horarios" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El label aparece TRES veces: rail desktop + header mobile (una copia
    // visible según el viewport vía CSS cada una) + la región viva oculta
    // (aria-live, plan §J) que anuncia el cambio de paso a un lector de
    // pantalla sin depender del foco.
    await expect(canvas.getAllByText('Paso 2 de 4 · 50%').length).toBe(3)
    const current = canvas.getByText('Horarios').closest('li')
    await expect(current).toHaveAttribute('aria-current', 'step')
    const done = canvas.getByText('Tu complejo').closest('li')
    await expect(done).not.toHaveAttribute('aria-current')
  },
} satisfies Story

/** El paso nuevo entra animado (Fase 6, AnimatePresence): el contenido queda visible igual. */
export const Paso4 = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/onboarding/reserva' } } },
  args: { children: <StepPlaceholder title="Tu primera reserva" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: 'Tu primera reserva' })
    await expect(heading).toBeVisible()
    await expect(canvas.getAllByText('Paso 4 de 4 · 100%').length).toBe(3)

    // Fase 8: un montaje inicial (carga dura — login, F5) no le roba el foco
    // al navegador; solo las transiciones DESPUÉS de la primera lo mueven al
    // `h2` (`focusedPathRef` en WizardChrome). Esta story es justo un montaje
    // inicial (Storybook no simula la navegación client-side entre pasos), así
    // que si el guard se rompiera, `onAnimationComplete` terminaría
    // enfocándolo igual — por eso la espera fija de acá, más larga que la
    // transición de 250 ms: es la ausencia de un efecto retrasado, que
    // `waitFor` (piensa en éxito inmediato) no puede probar.
    await new Promise((resolve) => setTimeout(resolve, 400))
    await expect(document.activeElement).not.toBe(heading)
  },
} satisfies Story

/** /onboarding/listo: paso 5, fuera de WIZARD_STEPS — "¡Listo!" en vez de "Paso N de 4". */
export const Listo = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/onboarding/listo' } } },
  args: { children: <StepPlaceholder title="¡Tu complejo está online!" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('¡Listo!').length).toBeGreaterThan(0)
  },
} satisfies Story
