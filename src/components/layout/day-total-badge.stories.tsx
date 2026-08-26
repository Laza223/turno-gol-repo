import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { DayTotalBadge } from './day-total-badge'

/**
 * B14 — el "Hoy: $X" de la barra lateral. Trae su propio dato de
 * `/api/admin/day-total`, así que todas las stories declaran `fetchMock`: sin
 * él, el decorator global escribe "fetch no mockeado" y la story quedaría
 * probando el placeholder por accidente en vez de a propósito.
 *
 * Se renderiza en una caja del ancho del rail (256 px) porque el número tiene
 * que entrar ahí: un total de siete cifras es lo que hace saltar el `truncate`.
 */
const meta = {
  title: 'Admin/Layout/DayTotalBadge',
  component: DayTotalBadge,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } },
    fetchMock: [
      {
        match: '/api/admin/day-total',
        json: { data: { date: '2026-08-12', collectedCents: 1250000 } },
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-64 bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DayTotalBadge>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El matcher va con un espacio **común**, aunque en el DOM haya un NBSP.
 *
 * `formatArs` produce `$` + U+00A0 + el número (verificado en Chromium, no solo
 * en Node). Pero testing-library normaliza el texto que saca del DOM —colapsa
 * `\s+`, y `\s` incluye el NBSP— y **no normaliza el matcher**. Un matcher con
 * NBSP termina comparando dos strings que se ven idénticos y no lo son, y el
 * error que tira es "Unable to find an element with the text": se lee como si
 * el componente no hubiera renderizado, cuando renderizó perfecto. Con espacio
 * común anda, y además sobrevive si ICU cambia el carácter (varias locales ya
 * pasaron de U+00A0 a U+202F).
 */
const ars = (s: string) => `$ ${s}`

export const ConMonto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El valor llega por el fetch (kickoff en setTimeout 0), no en el primer
    // render: sin waitFor esto mide el placeholder.
    await waitFor(() => expect(canvas.getByText(ars('12.500'))).toBeInTheDocument())
    // El número es un atajo a Caja: el pedido de fondo es no tener que ir a otra
    // pantalla para saber cómo viene el día.
    await expect(canvas.getByRole('link')).toHaveAttribute('href', '/caja')
  },
}

/**
 * Un sábado a la noche en un complejo grande. Siete cifras es el caso que
 * decide si el número entra en el rail o lo rompe.
 */
export const MontoGrande: Story = {
  parameters: {
    fetchMock: [
      {
        match: '/api/admin/day-total',
        json: { data: { date: '2026-08-12', collectedCents: 98_450_000 } },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText(ars('984.500'))).toBeInTheDocument())
  },
}

/**
 * Día sin movimientos todavía: **$0 es un dato, no un error**. Mostrar el cero
 * es lo que distingue "todavía no entró nada" de "no pude preguntar", y por eso
 * el componente no trata el 0 como "sin valor".
 */
export const DiaEnCero: Story = {
  parameters: {
    fetchMock: [
      { match: '/api/admin/day-total', json: { data: { date: '2026-08-12', collectedCents: 0 } } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText(ars('0'))).toBeInTheDocument())
  },
}

/**
 * El endpoint falla. Se queda el placeholder y NO se pinta un error en la barra
 * de navegación: el número no es accionable al segundo. Lo que no puede pasar es
 * mostrar un monto inventado.
 *
 * Acá el mock devuelve 500 SIEMPRE, así que se ve el peor caso. En la vida real
 * un 500 se reintenta solo a los 1, 3, 8 y 20 segundos, y basta con que uno de
 * esos entre para que el número aparezca sin esperar el ciclo de un minuto (ver
 * `day-total-badge-retry.test.tsx`, que sí puede scriptear el reloj).
 */
export const EndpointCaido: Story = {
  parameters: {
    fetchMock: [{ match: '/api/admin/day-total', json: { error: 'boom' }, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link')).toHaveAccessibleName('Cobrado hoy, cargando')
    await expect(canvas.queryByText(/^\$/)).not.toBeInTheDocument()
  },
}
