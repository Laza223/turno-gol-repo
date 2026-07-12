import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'
import ParaComplejosPage from './page'

/**
 * Página 100% estática (sin fetch/auth) — landing B2B, SIEMPRE superficie
 * oscura (`(business)/layout.tsx` fija `background:#020617` a mano, no es un
 * tema conmutable). `emerald-400` sobre ese fondo es correcto: no aplica el
 * idiom `text-emerald-700 dark:text-emerald-400` de las superficies claras.
 * Reproducimos el layout real (header + footer) para que el contraste y el
 * espaciado del fold se vean representativos.
 */
const meta = {
  title: 'Public/ParaComplejos',
  component: ParaComplejosPage,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div className="min-h-dvh text-slate-300" style={{ background: '#020617' }}>
        <BusinessHeader />
        <main>
          <Story />
        </main>
        <BusinessFooter />
      </div>
    ),
  ],
} satisfies Meta<typeof ParaComplejosPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(/tu complejo, siempre lleno/i)
    // "Empezar gratis" se repite en header/hero/CTA final/footer — todas deben ir a /register.
    const ctas = canvas.getAllByRole('link', { name: /empezar gratis/i })
    await expect(ctas.length).toBeGreaterThan(1)
    for (const cta of ctas) await expect(cta).toHaveAttribute('href', '/register')
    await expect(canvas.getByText('Reservas online 24/7')).toBeInTheDocument()
  },
}
