import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import { BookingSuccessCard, type ConfirmedBooking } from './BookingSuccessCard'

const base: ConfirmedBooking = {
  tenantName: 'Complejo Fénix',
  tenantSlug: 'complejo-fenix',
  courtName: 'Cancha 1',
  courtFormat: 5,
  address: 'Av. Rivadavia 4820',
  city: 'Ciudad Autónoma de Buenos Aires',
  latitude: -34.6083,
  longitude: -58.4386,
  startsOn: '2026-03-14',
  timeStart: '18:00',
  timeEnd: '19:00',
  priceSnapshot: 1500000,
  depositAmount: 450000,
  depositStatus: 'paid',
  hidePrices: false,
}

/**
 * La reserva confirmada vive en `reserva/[bookingId]/exito/page.tsx`, dentro de `PortalShell`: el
 * cascarón de La Previa (glow esmeralda), la insignia con brillo y una sola acción verde
 * ("Avisarle al grupo"). Las stories la montan sobre el fondo del tema.
 */
const meta = {
  title: 'Player/BookingResult/BookingSuccessCard',
  component: BookingSuccessCard,
  parameters: { layout: 'fullscreen' },
  args: {
    bookingId: uid(1001),
    complexUrl: 'https://turnogol.test/complejo-fenix',
    booking: base,
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BookingSuccessCard>

export default meta
type Story = StoryObj<typeof meta>

/** El texto que recibe el grupo: lo que lleva el `href` de "Avisarle al grupo", ya decodificado. */
function sharedText(canvas: ReturnType<typeof within>): string {
  const link = canvas.getByRole('link', { name: 'Avisarle al grupo' })
  const href = link.getAttribute('href')!
  return decodeURIComponent(href.slice(href.indexOf('?text=') + '?text='.length))
}

/** Con seña pagada: el resumen muestra la seña y lo que resta abonar en el complejo. */
export const ConSena: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeInTheDocument()
    const summary = within(canvas.getByRole('region', { name: 'Tu turno' }))
    await expect(summary.getByText('Complejo Fénix')).toBeInTheDocument()
    await expect(summary.getByText('18:00 a 19:00')).toBeInTheDocument()
    await expect(summary.getByText(/^Cancha 1/)).toHaveTextContent('Cancha 1 · Fútbol 5')
    // formatArs separa "$" del monto con NBSP; getByText normaliza a espacio común.
    await expect(summary.getByText('Seña pagada')).toBeInTheDocument()
    await expect(summary.getByText('$ 4.500')).toBeInTheDocument()
    await expect(summary.getByText('$ 10.500')).toBeInTheDocument()
    // El código corto de la reserva va abajo, como terciario. Se acota a su sección: el
    // comprobante imprimible (oculto) repite el código en el DOM.
    const code = within(canvas.getByRole('region', { name: 'Código de la reserva' }))
    await expect(code.getByText('00000000')).toBeInTheDocument()
    await expect(canvas.queryByRole('img', { name: /QR/i })).not.toBeInTheDocument()
  },
}

/** La única acción principal: un link a WhatsApp con el turno escrito, sin montos y sin window.open. */
export const AvisarleAlGrupo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Avisarle al grupo' })
    await expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/)
    const text = sharedText(canvas)
    await expect(text).toContain('Cancha 1 · Fútbol 5')
    await expect(text).toContain('Av. Rivadavia 4820')
    await expect(text).toContain('de 18:00 a 19:00')
    await expect(text.split('\n').at(-1)).toBe('https://turnogol.test/complejo-fenix')
    await expect(text).not.toContain('$')
    // Una sola acción principal: el resto son filas de la lista, no botones verdes.
    await expect(canvas.getAllByRole('link', { name: 'Avisarle al grupo' })).toHaveLength(1)
  },
}

/** Con el flag de RIVAL prendido: "Armar el partido" como secundaria, sin tocar "Avisarle al grupo". */
export const ConArmarElPartido: Story = {
  args: { rivalEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Armar el partido' })).toHaveAttribute(
      'href',
      `/rival/nuevo?reserva=${uid(1001)}`,
    )
    await expect(canvas.getByRole('link', { name: 'Avisarle al grupo' })).toBeTruthy()
  },
}

/** Sin seña (`requires_deposit: false` o pago 100% presencial): se abona el total en el complejo. */
export const SinSena: Story = {
  args: { booking: { ...base, depositAmount: 0, depositStatus: 'not_required' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const summary = within(canvas.getByRole('region', { name: 'Tu turno' }))
    await expect(summary.getByText('Pagás en el complejo')).toBeInTheDocument()
    await expect(summary.getByText('$ 15.000')).toBeInTheDocument()
    await expect(summary.queryByText('Seña pagada')).not.toBeInTheDocument()
  },
}

/** Precios ocultos con seña: ningún monto en el texto, en los atributos ni en el mensaje al grupo. */
export const PreciosOcultosConSena: Story = {
  args: { booking: { ...base, hidePrices: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const summary = within(canvas.getByRole('region', { name: 'Tu turno' }))
    await expect(summary.getByText('Seña pagada, el resto en el complejo')).toBeInTheDocument()
    await expect(canvasElement.innerHTML).not.toMatch(/\$|4\.500|10\.500|15\.000|450000|1500000/)
    await expect(sharedText(canvas)).not.toContain('$')
  },
}

/** Precios ocultos sin seña: solo dice que se paga en el complejo. */
export const PreciosOcultosSinSena: Story = {
  args: {
    booking: { ...base, hidePrices: true, depositAmount: 0, depositStatus: 'not_required' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Pagás en el complejo')).toBeInTheDocument()
    await expect(canvasElement.innerHTML).not.toMatch(/\$|15\.000|1500000/)
  },
}

/** Sin coordenadas: "Cómo llegar" busca la dirección escrita en Google Maps. */
export const SinCoordenadas: Story = {
  args: { booking: { ...base, latitude: null, longitude: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const href = canvas.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')!
    await expect(href).toContain('query=Av.%20Rivadavia%204820')
  },
}

/** Ni dirección ni coordenadas: no hay a dónde mandarlo, así que no hay "Cómo llegar". */
export const SinUbicacion: Story = {
  args: { booking: { ...base, address: '', latitude: null, longitude: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Cómo llegar' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Agregar al calendario' })).toBeInTheDocument()
  },
}

/** Nombres largos: se parten en líneas, nada se sale de la columna. */
export const NombreLargo: Story = {
  args: {
    booking: {
      ...base,
      tenantName: 'Complejo Deportivo Los Cuatro Hermanos del Norte Sociedad Civil',
      courtName: 'Cancha Principal Techada Sintética Premium 2',
      address: 'Av. Presidente Doctor Don Hipólito Yrigoyen y Rivadavia 4820, piso 3, local 12',
    },
  },
  play: async () => {
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )
  },
}
