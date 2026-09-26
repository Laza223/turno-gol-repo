import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import type { RevenueReport } from '@/modules/reports/report.types'
import {
  courtReport,
  methodReport,
  revenueReport,
  revenueReportFirstMonth,
  tenantMetrics,
} from '@/test/fixtures/metrics'
import { AnaliticasView } from './AnaliticasView'

/**
 * Métricas (`/analiticas`) entera, con la composición real (`AnaliticasView`)
 * dentro del marco del panel. El reloj de Storybook está en el sábado 14 de
 * marzo de 2026: marzo es el mes en curso.
 *
 * La página es async y lee la base; la story le pasa lo que la página calcula.
 * Los últimos 30 días salen de `/api/admin/metrics`, mockeado con `fetchMock`.
 */

const K = 100

/** Doce canchas y ajustes negativos: el complejo grande, con el mes en curso. */
const TWELVE_COURTS: Array<[string, number, number, number]> = [
  ['Cancha 1', 4_620_000, 62, 31.8],
  ['Cancha 2', 4_310_000, 58, 29.7],
  ['Cancha 3', 3_980_000, 54, 27.5],
  ['Cancha 4', 3_760_000, 51, 26],
  ['Cancha 5', 3_540_000, 48, 24.4],
  ['Cancha 6', 3_390_000, 46, 23.4],
  ['Cancha 7 · Techada', 5_880_000, 64, 33],
  ['Cancha 8', 2_870_000, 39, 19.9],
  ['Cancha 9 · F7', 4_960_000, 54, 27.8],
  ['Cancha 10 · F7', 4_150_000, 45, 23.2],
  ['La Chica', 1_120_000, 21, 10.8],
  ['Cancha 12 · F8 sintético nuevo', 2_340_000, 18, 13.9],
]

const INCOME_LOADED = 57_645_000 * K
const ADJ_LOADED = -380_000 * K

const LOADED: RevenueReport = revenueReport({
  income: INCOME_LOADED,
  adjustment: ADJ_LOADED,
  balance: INCOME_LOADED + ADJ_LOADED,
  bookingCount: 587,
  byCourt: TWELVE_COURTS.map(([courtName, pesos, bookingCount, occupancyPct], i) =>
    courtReport({ courtId: `c${i + 1}`, courtName, income: pesos * K, bookingCount, occupancyPct }),
  ),
  byMethod: [
    methodReport({ method: 'cash', total: 34_587_000 * K }),
    methodReport({ method: 'mercadopago', total: 20_752_000 * K }),
    methodReport({ method: 'transfer', total: 2_017_500 * K }),
    methodReport({ method: 'other', total: 288_000 * K }),
  ],
  prevPeriod: { income: 61_300_000 * K, adjustment: 0, balance: 61_300_000 * K },
})

/** Febrero cerrado, cinco canchas: el dueño mirando a fin de mes. */
const INCOME_CLOSED = 23_740_000 * K
const CLOSED: RevenueReport = revenueReport({
  income: INCOME_CLOSED,
  adjustment: 0,
  balance: INCOME_CLOSED,
  bookingCount: 268,
  byCourt: [
    courtReport({
      courtId: 'c1',
      courtName: 'Cancha 1',
      income: 3_960_000 * K,
      bookingCount: 55,
      occupancyPct: 24.6,
    }),
    courtReport({
      courtId: 'c2',
      courtName: 'Cancha 2',
      income: 3_720_000 * K,
      bookingCount: 52,
      occupancyPct: 23.3,
    }),
    courtReport({
      courtId: 'c3',
      courtName: 'Cancha 3',
      income: 4_410_000 * K,
      bookingCount: 61,
      occupancyPct: 27.3,
    }),
    courtReport({
      courtId: 'c4',
      courtName: 'Cancha 4',
      income: 3_150_000 * K,
      bookingCount: 44,
      occupancyPct: 19.7,
    }),
    courtReport({
      courtId: 'c5',
      courtName: 'Cancha 5 · F7',
      income: 3_890_000 * K,
      bookingCount: 46,
      occupancyPct: 20.6,
    }),
  ],
  byMethod: [
    methodReport({ method: 'cash', total: 15_431_000 * K }),
    methodReport({ method: 'mercadopago', total: 7_597_000 * K }),
    methodReport({ method: 'transfer', total: 712_000 * K }),
  ],
  prevPeriod: { income: 21_930_000 * K, adjustment: 0, balance: 21_930_000 * K },
})

const EMPTY: RevenueReport = revenueReport({
  income: 0,
  adjustment: 0,
  balance: 0,
  bookingCount: 0,
  byCourt: [],
  byMethod: [],
  prevPeriod: null,
})

function Page({
  report,
  month,
  isCurrent,
  canSeeSystem = false,
}: {
  report: RevenueReport
  month: string
  isCurrent: boolean
  canSeeSystem?: boolean
}) {
  const isEmpty = report.income === 0 && report.adjustment === 0 && report.bookingCount === 0
  const [y, m] = month.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <AdminLayoutShell
      tenantName="Complejo Fénix"
      tenantStatus="active"
      trialEndsAt={null}
      periodEnd={null}
      userEmail="dueno@complejofenix.com.ar"
      // Ninguna story toca "Salir": falla fuerte en vez de dejar una promesa colgada
      // (tests/unit/stories-no-dangling-promise.test.ts).
      signOut={fn(async () => {
        throw new Error('signOut no se usa en estas stories')
      })}
      staffRole="admin"
    >
      <AnaliticasView
        report={report}
        month={month}
        isCurrent={isCurrent}
        isEmpty={isEmpty}
        canSeeSystem={canSeeSystem}
        stepper={{
          label: label.charAt(0).toUpperCase() + label.slice(1),
          prevHref: '/analiticas?month=anterior',
          nextHref: isCurrent ? null : '/analiticas?month=siguiente',
        }}
        csv={{ from: `${month}-01`, to: `${month}-28` }}
      />
    </AdminLayoutShell>
  )
}

const meta = {
  title: 'Admin/Metricas/Analiticas',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/analiticas' } },
    fetchMock: [{ match: '/api/admin/metrics', json: { data: tenantMetrics() } }],
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Mes en curso con doce canchas y ajustes: lo que entró hasta hoy, febrero
 * entero como referencia (sin porcentaje: un mes a medias contra uno completo
 * mentía) y las canchas de la que más cobró a la que menos.
 */
export const MesEnCurso: Story = {
  render: () => <Page report={LOADED} month="2026-03" isCurrent />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Entró en marzo, hasta hoy' })).toBeVisible()
    await expect(canvas.getByText('$ 57.645.000')).toBeVisible()
    await expect(canvas.getByText(/En todo febrero/)).toBeVisible()
    await expect(canvas.queryByText(/% vs/)).not.toBeInTheDocument()
    await expect(canvas.getByText('−$ 380.000')).toBeVisible()
    await expect(canvas.getByText(/Con ajustes/)).toBeVisible()

    const items = within(canvas.getByRole('list', { name: 'Canchas del mes' })).getAllByRole(
      'listitem',
    )
    await expect(items).toHaveLength(12)
    await expect(items[0]).toHaveTextContent('Cancha 7 · Techada')

    await expect(await canvas.findByText('Últimos 30 días')).toBeVisible()
    for (const next of canvas.getAllByRole('button', { name: 'Mes siguiente' })) {
      await expect(next).toHaveAttribute('aria-disabled', 'true')
    }
  },
}

/** Febrero cerrado: acá sí va el porcentaje, y los 30 días corridos no se muestran. */
export const MesCerrado: Story = {
  render: () => <Page report={CLOSED} month="2026-02" isCurrent={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Entró en febrero' })).toBeVisible()
    await expect(canvas.getByText('8% vs enero')).toBeVisible()
    await expect(canvas.queryByText('Últimos 30 días')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/Con ajustes/)).not.toBeInTheDocument()
  },
}

/** Primer mes con datos: sin mes anterior no hay comparación que mostrar. */
export const PrimerMes: Story = {
  render: () => <Page report={revenueReportFirstMonth()} month="2026-03" isCurrent />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Entró en marzo, hasta hoy' })).toBeVisible()
    await expect(canvas.queryByText(/En todo/)).not.toBeInTheDocument()
  },
}

/** Complejo nuevo: un solo vacío, sin números de ejemplo ni export. */
export const SinDatos: Story = {
  render: () => <Page report={EMPTY} month="2026-03" isCurrent />,
  parameters: {
    fetchMock: [
      {
        match: '/api/admin/metrics',
        json: {
          data: tenantMetrics({
            topSlots: [],
            noShow: { noShow: 0, completed: 0, finished: 0, rate: 0 },
          }),
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Todavía no hay cobros en marzo' }),
    ).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Ir a la Grilla' })).toHaveAttribute(
      'href',
      '/grilla',
    )
    await expect(canvas.queryByRole('button', { name: /Exportar CSV/ })).not.toBeInTheDocument()
  },
}

/** Un mes pasado sin movimientos: lo dice y nada más. */
export const MesPasadoVacio: Story = {
  render: () => <Page report={EMPTY} month="2026-01" isCurrent={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'En enero no hubo cobros' })).toBeVisible()
    await expect(canvas.queryByRole('link', { name: 'Ir a la Grilla' })).not.toBeInTheDocument()
  },
}
