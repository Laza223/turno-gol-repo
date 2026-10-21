import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn } from 'storybook/test'
import { EliminarCuentaView } from './EliminarCuentaView'
import Loading from './loading'

/** Esqueleto de /eliminar-cuenta, en la columna de la página. */
const meta = {
  title: 'Player/EliminarCuenta/LoadingSkeleton',
  component: Loading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * El esqueleto ocupa el alto de la vista real SIN reservas por jugar (el caso común; con reservas
 * aparece además la tarjeta de aviso). Se compara el alto de los dos contenedores.
 *
 * Corre al ancho del runner: los `min-[Npx]` del esqueleto miran el VIEWPORT del iframe, y ni
 * `parameters.viewport` ni un contenedor angosto lo cambian; `page.viewport` pasa por el canal de
 * comandos de Vitest, que con ~280 stories en paralelo tarda decenas de segundos y muta la página
 * compartida (ver `PortalWorld.stories.tsx`): no es estable. Las medidas a 320/360/390/430 px
 * (Chromium, vista real vs esqueleto) se tomaron con Playwright contra Storybook: desvío 0 px en todos los bloques a 320 (850), 360 (826), 390 (782), 430 (734) y 1280 (714).
 */
export const AlturaDelEsqueleto: Story = {
  render: () => (
    <>
      <div data-t="esqueleto">
        <Loading />
      </div>
      <div data-t="real">
        <EliminarCuentaView
          confirmEmail="tomas.ibanez@example.com"
          futureConfirmedCount={0}
          action={fn(async () => ({ success: true as const }))}
        />
      </div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const alto = (t: string) =>
      canvasElement.querySelector(`[data-t="${t}"]`)!.getBoundingClientRect().height
    await expect(Math.abs(alto('esqueleto') - alto('real'))).toBeLessThanOrEqual(8)
  },
}
