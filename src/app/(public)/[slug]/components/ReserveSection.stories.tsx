import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { addDays } from '@/shared/dates/art'
import { openingHours } from '@/test/fixtures/tenant'
import {
  availabilityResponse,
  availabilityResponseCourts,
  availabilityResponseNoCourts,
  availabilityResponseNoSlots,
  availabilityResponseWithHold,
  publicTenant,
  publicTenantNoOnlineBooking,
  todayArt,
  weeklyAvailabilityResponse,
} from '@/test/fixtures/public'
import { withPortalGlass } from '../../../../../.storybook/decorators/with-portal-glass'
import ReserveSection, { ReserveSkeleton } from './ReserveSection'

/**
 * La reserva de la ficha del complejo en una pantalla (portal de vidrio, F4), a ~400 px: un
 * celular. El reloj de Storybook está congelado el sábado 14-mar-2026 15:30 ART, así que "hoy" es
 * esa fecha y las horas de la fixture (16:00 a 00:00) quedan todas por delante. La barra de
 * "Reservar" va en un portal a `<body>`: se busca ahí y no dentro del canvas.
 */
const meta = {
  title: 'Player/TenantProfile/ReserveSection',
  component: ReserveSection,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/complejo-fenix' } },
  },
  args: { tenant: publicTenant(), formats: [5, 7], trackViewed: fn(async () => undefined) },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="mx-auto max-w-[400px]">
          <Story />
        </div>
      </PortalWorld>
    ),
    withPortalGlass(),
  ],
} satisfies Meta<typeof ReserveSection>

export default meta
type Story = StoryObj<typeof meta>

const DAY_ROUTE = '/api/public/availability'
const WEEK_ROUTE = '/api/public/availability/week'
/** La semana de la fila de días. Va PRIMERO en cada `fetchMock`: `DAY_ROUTE` es prefijo de esta ruta. */
const WEEK = { match: WEEK_ROUTE, json: weeklyAvailabilityResponse(todayArt()) }

/**
 * Sin semana: si trajera el día, las horas arrancarían con ella y un fallo del pedido del día no
 * se vería (se muestra lo último que se sabe). Para probar el error, la semana también falla.
 */
const NO_WEEK = { match: WEEK_ROUTE, json: {}, status: 500 }

/** Un día que ya no tiene ninguna hora libre. */
function fullDay() {
  const day = availabilityResponseCourts(2)
  return {
    ...day,
    courts: day.courts.map((c) => ({
      ...c,
      slots: c.slots.map((s) => ({ ...s, status: 'occupied' as const })),
    })),
  }
}

/** La barra de "Reservar", que vive en `<body>`. */
const findBar = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole('complementary', { name: 'Tu turno' })

/** Toca la hora y devuelve la barra que sube. */
async function pickHour(canvasElement: HTMLElement, time: string) {
  const canvas = within(canvasElement)
  await userEvent.click(await canvas.findByRole('button', { name: new RegExp(`^${time}`) }))
  return within(await findBar(canvasElement))
}

export const Default: Story = {
  parameters: {
    fetchMock: [
      WEEK,
      { match: DAY_ROUTE, json: availabilityResponseCourts(5, { formats: [5, 7] }) },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('heading', { name: 'Reservá tu turno' })).toBeVisible()
    // Hoy viene elegido.
    await expect(canvas.getByRole('button', { name: /^Hoy, sábado 14/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const hours = within(await canvas.findByRole('group', { name: 'Hora' })).getAllByRole('button')
    // El día operativo va en orden del servidor: la madrugada al final.
    await expect(hours.at(-1)).toHaveTextContent('00:00')
    await expect(canvas.getByRole('button', { name: /^19:00/ })).toBeDisabled()
    const bar = await pickHour(canvasElement, '21:00')
    await expect(bar.getAllByRole('radio')).toHaveLength(5)
    await expect(bar.getByRole('link')).toHaveTextContent(/^Reservar/)
    await expect(canvas.getByRole('status')).toHaveTextContent('21:00: 5 canchas libres')
    // La X cierra la barra y la hora queda libre para elegir otra.
    await userEvent.click(bar.getByRole('button', { name: 'Cerrar y elegir otra hora' }))
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('complementary', {
          name: 'Tu turno',
        }),
      ).not.toBeInTheDocument(),
    )
  },
}

/** La barra abierta, como llega un link a una hora (`?date=&hora=`): para mirarla quieta. */
export const BarraAbierta: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/complejo-fenix', query: { date: todayArt(), hora: '21:00' } },
    },
    fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponse() }],
  },
  play: async ({ canvasElement }) => {
    const bar = within(await findBar(canvasElement))
    // Entra con un fundido: se espera a que termine.
    await waitFor(() => expect(bar.getByText(/Hoy, sábado 14 · 21:00 a 22:00/)).toBeVisible())
    await expect(bar.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true')
  },
}

export const Cargando: Story = {
  render: () => <ReserveSkeleton />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Reservá tu turno' }),
    ).toHaveAttribute('aria-busy', 'true')
  },
}

export const ErrorDeCarga: Story = {
  parameters: { fetchMock: [NO_WEEK, { match: DAY_ROUTE, json: {}, status: 500 }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los horarios del sábado 14',
    )
    await expect(canvas.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    // La fila de días sigue a mano: se puede elegir otro día.
    await expect(canvas.getByRole('group', { name: 'Día' })).toBeVisible()
  },
}

/** El servidor frenó los pedidos (429): pide esperar unos segundos, no revisar la conexión. */
export const ErrorPorDemasiadasConsultas: Story = {
  parameters: { fetchMock: [NO_WEEK, { match: DAY_ROUTE, json: {}, status: 429 }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const alert = await canvas.findByRole('alert')
    await expect(alert).toHaveTextContent('Hubo demasiadas consultas seguidas')
    await expect(alert).toHaveTextContent('Esperá unos segundos')
    await expect(alert).not.toHaveTextContent('conexión')
    await expect(canvas.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  },
}

/** El complejo no está disponible (404): lo dice y deja salir; reintentar no tiene sentido. */
export const ComplejoNoDisponible: Story = {
  parameters: { fetchMock: [NO_WEEK, { match: DAY_ROUTE, json: {}, status: 404 }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const alert = await canvas.findByRole('alert')
    await expect(alert).toHaveTextContent('Este complejo no está disponible')
    await expect(alert).toHaveTextContent('No se puede reservar acá por ahora.')
    await expect(canvas.getByRole('link', { name: 'Buscar otro complejo' })).toHaveAttribute(
      'href',
      '/explorar',
    )
    await expect(canvas.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  },
}

/** El complejo bajó cuántos días deja reservar y esta página es vieja (400): vuelve a hoy, sin reintentar. */
export const DiaFueraDeVentana: Story = {
  parameters: {
    fetchMock: [NO_WEEK, { match: DAY_ROUTE, json: { error: 'date_out_of_range' }, status: 400 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const alert = await canvas.findByRole('alert')
    await expect(alert).toHaveTextContent('Ese día ya no se puede reservar')
    await expect(alert).not.toHaveTextContent('de nuestro lado')
    await expect(canvas.getByRole('button', { name: 'Ver hoy' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  },
}

/** Hoy cerrado: el día se ve apagado y dicho con palabras, y la salida es el próximo día abierto. */
export const DiaCerrado: Story = {
  args: { tenant: publicTenant({ closedDates: [todayArt()] }) },
  parameters: { fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponseCourts(2) }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: /^Hoy.*Cerrado/ })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /^Domingo 15/ })).toBeEnabled()
    await expect(await canvas.findByText('Cerrado el sábado 14')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Ver el domingo 15' })).toBeInTheDocument()
  },
}

/** La semana cargada: Hay lugar, Completo, Sin horarios y Cerrado, siempre con palabras. */
export const SemanaConEstados: Story = {
  args: { tenant: publicTenant({ closedDates: [addDays(todayArt(), 2)] }) },
  parameters: {
    fetchMock: [
      {
        match: WEEK_ROUTE,
        json: {
          ...weeklyAvailabilityResponse(todayArt()),
          days: weeklyAvailabilityResponse(todayArt()).days.map((d, i) =>
            i === 1 ? { ...d, courts: fullDay().courts } : i === 3 ? { ...d, courts: [] } : d,
          ),
        },
      },
      { match: DAY_ROUTE, json: availabilityResponseCourts(2) },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: /^Hoy.*Hay lugar/ })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: /^Domingo 15.*Completo/ })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /Cerrado/ })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /Sin horarios/ })).toBeDisabled()
  },
}

/** Quedan horas pero todas completas, y mañana hay lugar: la salida es un botón al otro día. */
export const DiaCompleto: Story = {
  parameters: {
    fetchMock: [
      { match: WEEK_ROUTE, json: weeklyAvailabilityResponse(addDays(todayArt(), 1)) },
      { match: DAY_ROUTE, json: fullDay() },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No quedan horarios el sábado 14')).toBeVisible()
    await expect(
      await canvas.findByRole('button', { name: 'Ver el domingo 15' }),
    ).toBeInTheDocument()
    // Con otro día al que ir no hace falta la grilla de "Completo".
    await expect(canvas.queryByRole('group', { name: 'Hora' })).not.toBeInTheDocument()
  },
}

/** Día completo y la búsqueda del próximo día falló: no afirma que no hay lugar, deja reintentar. */
export const BusquedaDeOtroDiaFallida: Story = {
  parameters: {
    fetchMock: [
      { match: WEEK_ROUTE, json: {}, status: 500 },
      { match: DAY_ROUTE, json: fullDay() },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No pudimos buscar otro día.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    await expect(canvas.queryByText(/No hay lugar/)).not.toBeInTheDocument()
  },
}

/** El día no tiene horas (ya pasaron) y los 6 días que siguen están completos: lo dice con el número real y sale a hablar con el complejo. */
export const SinLugarEnLaSemana: Story = {
  parameters: {
    fetchMock: [
      {
        match: WEEK_ROUTE,
        json: {
          startDate: addDays(todayArt(), 1),
          days: Array.from({ length: 6 }, (_, i) => ({
            date: addDays(todayArt(), i + 1),
            courts: fullDay().courts,
          })),
        },
      },
      { match: DAY_ROUTE, json: availabilityResponseNoSlots() },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No hay lugar en los próximos 6 días.')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Consultar por WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\//),
    )
  },
}

export const SinCanchas: Story = {
  args: { formats: [] },
  parameters: { fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponseNoCourts() }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Este complejo todavía no tiene canchas para reservar'),
    ).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Consultar por WhatsApp' })).toBeInTheDocument()
  },
}

/** Alguien está pagando la seña: la hora se ve "Señando", no se elige y explica que puede liberarse. */
export const Senando: Story = {
  args: { formats: [5] },
  parameters: { fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponseWithHold() }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const held = await canvas.findByRole('button', { name: /^20:00/ })
    await expect(held).toBeDisabled()
    await expect(held).toHaveTextContent('Señando')
    await expect(canvas.getByText(/alguien está pagando la seña/i)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /^22:00/ })).toHaveTextContent('Completo')
  },
}

/** Sin reserva online el botón de la barra abre WhatsApp con el pedido ya escrito. */
export const SinReservaOnline: Story = {
  args: { tenant: publicTenantNoOnlineBooking() },
  parameters: { fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponseCourts(3) }] },
  play: async ({ canvasElement }) => {
    const bar = await pickHour(canvasElement, '21:00')
    await expect(bar.getAllByRole('radio')).toHaveLength(3)
    const link = bar.getByRole('link')
    await expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\//))
    await expect(link).toHaveTextContent('Consultar por WhatsApp')
  },
}

/** Complejo que oculta sus precios: ningún monto, ni en el texto ni en un aria-label. */
export const PreciosOcultos: Story = {
  args: { tenant: publicTenant({ hidePrices: true }) },
  parameters: {
    fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponseCourts(3, { price: null }) }],
  },
  play: async ({ canvasElement }) => {
    const bar = await pickHour(canvasElement, '21:00')
    const body = canvasElement.ownerDocument.body
    await expect(body.textContent).not.toContain('$')
    await expect(bar.getByRole('link')).toHaveTextContent(/^Reservar$/)
    const labels = [...body.querySelectorAll('[aria-label]')].map((el) =>
      el.getAttribute('aria-label'),
    )
    await expect(labels.filter((label) => label?.includes('$'))).toEqual([])
  },
}

/** Control de la anterior: con los precios visibles el monto sale en cada cancha y en el botón. */
export const PreciosVisibles: Story = {
  parameters: { fetchMock: [WEEK, { match: DAY_ROUTE, json: availabilityResponse() }] },
  play: async ({ canvasElement }) => {
    const bar = await pickHour(canvasElement, '20:00')
    await expect(bar.getAllByRole('radio')[0]).toHaveTextContent('13.000')
    await expect(bar.getByRole('link')).toHaveTextContent('13.000')
  },
}

/** El filtro de tamaño acota las horas sin volver a pedir el día. */
export const FiltroPorFormato: Story = {
  parameters: {
    fetchMock: [
      WEEK,
      { match: DAY_ROUTE, json: availabilityResponseCourts(4, { formats: [5, 7] }) },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('radio', { name: 'Fútbol 7' }))
    // 20:00 solo queda libre en la primera cancha (Fútbol 5): sin ese tamaño, no hay hora.
    await expect(await canvas.findByRole('button', { name: /^20:00/ })).toBeDisabled()
    const bar = await pickHour(canvasElement, '21:00')
    await expect(bar.getAllByRole('radio')).toHaveLength(2)
  },
}

/** Mismo componente con 1, 3, 5, 10 y 16 canchas: la barra crece y scrollea, la página no se rompe. */
function conCanchas(count: number): Story {
  return {
    parameters: {
      fetchMock: [
        WEEK,
        { match: DAY_ROUTE, json: availabilityResponseCourts(count, { formats: [5] }) },
      ],
    },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement)
      // Con una sola cancha la hora libre es "Libre" (no es escasez); con varias libres, "N libres".
      await expect(await canvas.findByRole('button', { name: /^21:00/ })).toHaveTextContent(
        count === 1 ? 'Libre' : `${count} libres`,
      )
      const bar = await pickHour(canvasElement, '21:00')
      await expect(bar.getAllByRole('radio')).toHaveLength(count)
    },
  }
}
export const UnaCancha = conCanchas(1)
export const TresCanchas = conCanchas(3)
export const CincoCanchas = conCanchas(5)
export const DiezCanchas = conCanchas(10)
export const DieciseisCanchas = conCanchas(16)

const LATE = { open: '09:00', close: '01:00' }

/** Un complejo tipo El Vagón: 5 canchas de Fútbol 5 y 7, precios ocultos, cierra a la 01:00. */
export const ElVagon: Story = {
  args: {
    tenant: publicTenant({
      name: 'El Vagón Deportivo',
      slug: 'el-vagon-deportivo',
      hidePrices: true,
      closesNextDay: true,
      openingHours: openingHours({
        mon: LATE,
        tue: LATE,
        wed: LATE,
        thu: LATE,
        fri: LATE,
        sat: LATE,
        sun: LATE,
      }),
    }),
  },
  parameters: {
    fetchMock: [
      WEEK,
      {
        match: DAY_ROUTE,
        json: availabilityResponseCourts(5, { formats: [5, 7, 7, 5, 7], price: null }),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const hours = within(await canvas.findByRole('group', { name: 'Hora' })).getAllByRole('button')
    await expect(hours.at(-1)).toHaveTextContent('00:00')
    const bar = await pickHour(canvasElement, '00:00')
    await expect(bar.getAllByRole('radio')).toHaveLength(5)
    await waitFor(() => expect(bar.getByText(/00:00 a 01:00/)).toBeVisible())
    await expect(canvasElement.ownerDocument.body.textContent).not.toContain('$')
  },
}
