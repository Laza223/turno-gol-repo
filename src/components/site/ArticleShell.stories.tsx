import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ArticleShell } from './ArticleShell'
import { contactWhatsappUrl } from '@/lib/contact'

/**
 * Server Component puro y sincrónico: sin estado, sin fetch, sin browser APIs.
 * Las páginas reales que lo consumen (`(business)/blog/[slug]/page.tsx`,
 * `(business)/alternativas-alquila-tu-cancha/page.tsx`) lo envuelven en el layout de
 * `(business)`, con el marcador de vidrio y la luz de fondo: se reproduce acá porque el
 * artículo no trae fondo propio.
 */
const meta = {
  title: 'Public/ArticleShell',
  component: ArticleShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient min-h-screen text-portal-ink">
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Los mejores sistemas de gestión de canchas de fútbol en Argentina',
    description:
      'Comparamos las opciones disponibles para complejos deportivos que quieren dejar el cuaderno y el WhatsApp atrás.',
    children: (
      <p>
        Administrar un complejo con un cuaderno de espiral y mensajes de WhatsApp a cualquier hora
        ya no es sostenible.
      </p>
    ),
  },
} satisfies Meta<typeof ArticleShell>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Caso base: título + descripción + fecha, como llega desde el frontmatter del MDX.
 */
export const Default: Story = {
  args: { date: '2026-07-12' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: 'Los mejores sistemas de gestión de canchas de fútbol en Argentina',
      }),
    ).toBeVisible()
    await expect(canvas.getByText('2026-07-12')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Contactanos por WhatsApp' })).toHaveAttribute(
      'href',
      contactWhatsappUrl('Hola! Quiero saber más sobre TurnoGol para mi complejo.'),
    )
  },
}

/**
 * Sin fecha (frontmatter opcional en `getPostBySlug`): no se renderiza el
 * párrafo de fecha, y el JSON-LD tampoco incluye `datePublished`.
 */
export const SinFecha: Story = {
  args: { date: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('2026-07-12')).not.toBeInTheDocument()
    const script = canvasElement.querySelector('script[type="application/ld+json"]')
    const jsonLd = JSON.parse(script?.textContent ?? '{}') as { datePublished?: string }
    await expect(jsonLd.datePublished).toBeUndefined()
  },
}

/**
 * Título largo de SEO (headline realista de comparativa): el `h1` centrado
 * tiene que envolver en varias líneas sin forzar scroll horizontal en mobile.
 */
export const TituloLargo: Story = {
  args: {
    title:
      'Los mejores sistemas de gestión de canchas de fútbol para complejos deportivos profesionales de Argentina en 2026: guía completa',
  },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toBeVisible()
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}

/**
 * Contenido rico del MDX: varios párrafos, headings y una lista — confirma
 * que los estilos de `.ar-prose` (`article.css`) aplican.
 */
export const ContenidoRico: Story = {
  args: {
    children: (
      <>
        <h2>¿Por qué cambiar de sistema?</h2>
        <p>
          El cuaderno de espiral y el WhatsApp funcionan hasta que dejan de funcionar: turnos
          superpuestos, señas que nadie anota, horas perdidas cada noche cuadrando la caja.
        </p>
        <h3>Lo que resuelve un sistema dedicado</h3>
        <ul>
          <li>Grilla en tiempo real, sin dobles reservas</li>
          <li>Cobro de señas online</li>
          <li>Caja diaria con cierre automático</li>
        </ul>
        <p>El resto de esta nota compara las opciones disponibles en el mercado argentino.</p>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 2, name: '¿Por qué cambiar de sistema?' }),
    ).toBeVisible()
    // Scopeado a `.ar-prose`: el `<ol>` del Toaster global también matchea el rol
    // implícito "list" (es una lista ordenada vacía, siempre montada por el preview).
    const prose = within(canvasElement.querySelector('.ar-prose') as HTMLElement)
    await expect(prose.getByRole('list')).toBeVisible()
    await expect(prose.getAllByRole('listitem')).toHaveLength(3)
  },
}
