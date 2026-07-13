import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import SuccessRedirect from './SuccessRedirect'

/**
 * Island de la página /verify: cuenta regresiva visible y, a los 5s,
 * `window.location.assign(next)`.
 *
 * OJO CON EL REDIRECT. En el runner, las stories corren dentro de un iframe: si el
 * `assign` llega a dispararse, NAVEGA el iframe y se lleva puesta la corrida entera,
 * no solo esta story. `Location` es [LegacyUnforgeable] en el spec (no se puede
 * reemplazar `window.location` ni pisar sus métodos), así que no hay stub posible.
 *
 * La defensa es el ciclo de vida: el `useEffect` del componente limpia el `setTimeout`
 * al desmontar, y la story termina (play + scan de axe) MUY por debajo de los 5s. El
 * `play` además espera solo el primer tick — no se queda esperando el final de la
 * cuenta, que es justo lo que la haría cruzar el umbral.
 *
 * `next` apunta igual a una ruta interna e inerte, para que un desmonte tardío bajo
 * carga no termine pidiéndole nada a la red.
 */
/**
 * La card real de /verify: siempre OSCURA, no theme-adaptive (el `<h1>` de al lado es
 * `text-white` fijo). En la app es un gradiente translúcido sobre un fondo sólido:
 *
 *   page.tsx:53  fondo de página .... #020617                      (sólido)
 *   page.tsx:34  card ............... linear-gradient(180deg,
 *                                       rgba(15,23,42,.72),
 *                                       rgba(2,6,23,.85))          (translúcido)
 *
 * ACÁ VA UN COLOR SÓLIDO A PROPÓSITO, NO EL GRADIENTE. **axe no sabe medir contraste
 * contra un `linear-gradient`**: no lo reporta como violación, lo reporta como
 * `incomplete` — y el addon-a11y solo falla con violaciones. O sea que copiar el
 * gradiente tal cual en el decorator le APAGA el check de contraste a la story sin
 * decir nada. La primera versión de este archivo hizo exactamente eso y pasó en verde
 * tapando el bug de abajo: una story que no puede fallar.
 *
 * #0B1225 es el tope del gradiente ya compuesto sobre el #020617 de la página
 * (0.72·(15,23,42) + 0.28·(2,6,23)). Es el punto de MENOR contraste de la card contra un
 * texto gris medio, o sea el caso peor y el que hay que testear.
 */
const CARD_BG_COMPOSITED = '#0B1225'

const DarkCardDecorator = (Story: () => JSX.Element) => (
  <div
    className="rounded-2xl p-8 text-center"
    style={{ background: CARD_BG_COMPOSITED, border: '1px solid rgba(255,255,255,.1)' }}
  >
    <Story />
  </div>
)

const meta = {
  title: 'Auth/SuccessRedirect',
  component: SuccessRedirect,
  parameters: { layout: 'padded' },
  decorators: [DarkCardDecorator],
  args: { next: '/dashboard' },
} satisfies Meta<typeof SuccessRedirect>

export default meta
type Story = StoryObj<typeof meta>

/** Estado inicial: arranca en 5s. */
export const CuentaRegresiva: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/te llevamos automáticamente en 5s/i)).toBeVisible()
  },
}

/**
 * El contador DECREMENTA. Es la única aserción que prueba que el `setInterval` está
 * vivo: sin ella, un componente que renderiza "5s" y se queda clavado para siempre
 * pasaría la story anterior sin despeinarse.
 *
 * Espera el primer tick (5 -> 4) y corta. No espera a que llegue a 0: eso serían 5s
 * completos, o sea exactamente el instante del `location.assign`.
 *
 * El reloj congelado de `preview.tsx` no interfiere: congela `Date`, no los timers.
 */
export const Decrementa: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/en 5s/i)
    await waitFor(() => expect(canvas.getByText(/en 4s/i)).toBeVisible(), { timeout: 2500 })
  },
}
