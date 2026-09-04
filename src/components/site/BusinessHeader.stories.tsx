import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import BusinessHeader from './BusinessHeader'
import { PortalSessionProvider } from './PortalSessionProvider'

/**
 * `position: fixed` respecto del viewport: un wrapper `position: relative`
 * simple NO lo contiene. Se fuerza un containing block nuevo con `transform`
 * (truco estándar) + una caja con altura fija, así el pill no tapa los
 * controles del canvas de Storybook. Fondo siempre oscuro (`rgba(8,15,32,.62)`
 * + blur) — independiente del theme del viewer.
 */
const meta = {
  title: 'Public/BusinessHeader',
  component: BusinessHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div
        style={{ transform: 'translateZ(0)', height: 160, background: '#0b1220' }}
        className="relative isolate overflow-hidden"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BusinessHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * Un COMPLEJO con la sesión abierta que llega a una página comercial (precios,
 * funciones, blog). Su link "Ingresar" era literalmente el botón que apretaba
 * alguien que YA estaba adentro; ahora lo lleva a su panel.
 *
 * Se siembra `initialValue` en el provider: eso corta el fetch a
 * /api/player/session, así la story no depende de la red.
 */
export const ComplejoLogueado: Story = {
  decorators: [
    (Story) => (
      <PortalSessionProvider
        initialValue={{
          session: null,
          favoriteTenantIds: new Set(),
          staffPanelPath: '/dashboard',
        }}
      >
        <Story />
      </PortalSessionProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const links = await canvas.findAllByRole('link', { name: 'Ir a mi panel' })
    await expect(links[0]).toHaveAttribute('href', '/dashboard')
    // El CTA comercial no se toca: sacarlo por tener sesión sería un cambio de
    // producto, no un arreglo.
    await expect(canvas.getByRole('link', { name: /empezar gratis/i })).toBeInTheDocument()
  },
}

// MEJORA-UX QA: el menú hamburguesa nuevo (trigger `sm:hidden`) no tiene story
// con `play` acá — el test runner de Storybook corre el browser real a
// ~1280px (Playwright default; `parameters.viewport` no lo angosta, ver el
// mismo hallazgo ya documentado en HeroSearch.tsx), así que el trigger nunca
// sería clickeable ahí. Verificado a mano contra el dev server de Storybook a
// 375px (Claude_Browser + Chromium real): abre, lista los 4 links, cierra.
