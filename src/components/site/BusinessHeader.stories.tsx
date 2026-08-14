import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import BusinessHeader from './BusinessHeader'

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

// MEJORA-UX QA: el menú hamburguesa nuevo (trigger `sm:hidden`) no tiene story
// con `play` acá — el test runner de Storybook corre el browser real a
// ~1280px (Playwright default; `parameters.viewport` no lo angosta, ver el
// mismo hallazgo ya documentado en HeroSearch.tsx), así que el trigger nunca
// sería clickeable ahí. Verificado a mano contra el dev server de Storybook a
// 375px (Claude_Browser + Chromium real): abre, lista los 4 links, cierra.
