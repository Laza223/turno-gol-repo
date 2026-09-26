import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { AdminLayoutShell } from '@/components/layout/admin-layout-shell'
import type { DaySummary } from '@/modules/cashflow/cashflow.types'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'
import { CajaTabs } from '../components/CajaTabs'
import { DayStepper } from './DayStepper'
import { NightLedger } from './NightLedger'
import { NightSummary } from './NightSummary'
import { PendingLines } from './PendingLines'
import type { LedgerRow } from './ledger'

/**
 * Caja › Cuentas, el libro de la noche, con la forma de una noche real del
 * piloto: jueves, 5 canchas, turno de $ 84.000 en dos equipos, 13 cobros de
 * turno, 25 ventas de cantina, un fiado cobrado, dos abiertos y 16 turnos no
 * cobrados de días anteriores por $ 1.017.000. Los nombres son inventados.
 *
 * La página es un Server Component: la story arma lo mismo con sus piezas. El
 * cobro real (`CuentasPending` con sus diálogos) importa Server Actions y no
 * entra en Storybook; acá "Cobrar" es un `fn()`.
 */

const K = 100
const TURNO = 84_000 * K
const MITAD = TURNO / 2

type Method = LedgerRow['method']

const TURNOS: Array<[string, string, 1 | 2 | null, Method, number]> = [
  ['23:04', 'Nahuel Vega', 2, 'mercadopago', MITAD],
  ['23:02', 'Nahuel Vega', 1, 'cash', MITAD],
  ['22:05', 'Agustín Molina', 2, 'transfer', MITAD],
  ['22:03', 'Agustín Molina', 1, 'cash', MITAD],
  ['21:16', 'Ezequiel Romero', 2, 'cash', MITAD],
  ['21:15', 'Ezequiel Romero', 1, 'mercadopago', MITAD],
  ['21:06', 'Gonzalo Paz', 2, 'cash', 30_000 * K],
  ['21:04', 'Gonzalo Paz', 1, 'cash', MITAD],
  ['20:12', 'Martín Sosa', null, 'mercadopago', TURNO],
  ['20:07', 'Lucas Benítez', 2, 'cash', MITAD],
  ['20:05', 'Lucas Benítez', 1, 'cash', MITAD],
  ['19:10', 'Franco Díaz', 2, 'mercadopago', MITAD],
  ['19:08', 'Franco Díaz', 1, 'cash', MITAD],
]

const CANTINA: Array<[string, string, Method, number]> = [
  ['23:27', 'AMSTEL x2', 'mercadopago', 12_000],
  ['23:19', 'COCA-SPRITE', 'cash', 7_000],
  ['23:12', 'PAPAS GR', 'cash', 3_500],
  ['23:08', 'IMPERIAL x3', 'mercadopago', 21_000],
  ['22:57', 'HEINEKEN x2', 'cash', 20_000],
  ['22:38', 'JUGOS x2', 'cash', 5_000],
  ['22:26', 'AMSTEL x2, EMPANADA x2', 'cash', 17_000],
  ['22:14', 'AGUA', 'cash', 1_000],
  ['22:10', 'IMPERIAL x2', 'mercadopago', 14_000],
  ['21:55', 'CONO DE PAPA', 'cash', 5_000],
  ['21:48', 'AMSTEL', 'cash', 6_000],
  ['21:22', 'EMPANADA x6', 'cash', 15_000],
  ['21:09', 'IMPERIAL x6, COCA-SPRITE', 'mercadopago', 49_000],
  ['20:52', 'GUAYMALLEN x4', 'cash', 2_000],
  ['20:44', 'IMPERIAL', 'cash', 7_000],
  ['20:31', 'JUGOS', 'cash', 2_500],
  ['20:19', 'PAPAS GR x2, COCA-SPRITE 500ML', 'cash', 10_000],
  ['20:16', 'HEINEKEN', 'mercadopago', 10_000],
  ['19:58', 'AMSTEL x3', 'cash', 18_000],
  ['19:33', 'COCA-SPRITE 500ML', 'cash', 3_000],
  ['19:21', 'EMPANADA x4', 'mercadopago', 10_000],
  ['19:02', 'IMPERIAL x2', 'cash', 14_000],
  ['18:40', 'POWER CH', 'cash', 2_500],
  ['18:14', 'AGUA x2', 'cash', 2_000],
]

const FIADO_COBRADO: LedgerRow = {
  id: 'f0',
  time: '21:39',
  kind: 'fiado',
  text: 'Fiado cobrado — Seba',
  detail: null,
  method: 'cash',
  cents: 7_000 * K,
  expense: false,
}

const ROWS: LedgerRow[] = [
  ...TURNOS.map(([time, name, team, method, cents], i): LedgerRow => ({
    id: `t${i}`,
    time,
    kind: 'turno',
    text: name,
    detail: team ? `Equipo ${team}` : null,
    method,
    cents,
    expense: false,
  })),
  ...CANTINA.map(([time, text, method, pesos], i): LedgerRow => ({
    id: `c${i}`,
    time,
    kind: 'cantina',
    text,
    detail: null,
    method,
    cents: pesos * K,
    expense: false,
  })),
  FIADO_COBRADO,
].sort((a, b) => b.time.localeCompare(a.time))

const sum = (rows: LedgerRow[]) => rows.reduce((s, r) => s + r.cents, 0)
const byMethod = (m: Method) => sum(ROWS.filter((r) => r.method === m))
const COLLECTED = sum(ROWS)
const TURNOS_CENTS = sum(ROWS.filter((r) => r.kind === 'turno'))

const SUMMARY: DaySummary = {
  date: '2026-09-24',
  totalIncome: COLLECTED,
  totalAdjustments: 0,
  totalExpense: 0,
  collected: COLLECTED,
  balance: COLLECTED,
  byCategory: { booking: TURNOS_CENTS, product_sale: COLLECTED - TURNOS_CENTS },
  byMethod: {
    cash: byMethod('cash'),
    mercadopago: byMethod('mercadopago'),
    transfer: byMethod('transfer'),
  },
  collectedByMethod: {
    cash: byMethod('cash'),
    mercadopago: byMethod('mercadopago'),
    transfer: byMethod('transfer'),
  },
}

const EMPTY_SUMMARY: DaySummary = {
  date: '2026-09-20',
  totalIncome: 0,
  totalAdjustments: 0,
  totalExpense: 0,
  collected: 0,
  balance: 0,
  byCategory: {},
  byMethod: {},
  collectedByMethod: {},
}

/** Jueves 24/09/2026, 23:40 en Argentina: la noche de la story. */
const NOW_MS = Date.parse('2026-09-25T02:40:00.000Z')
const daysAgo = (n: number, hhmm: string) =>
  new Date(
    NOW_MS -
      n * 86_400_000 -
      (23 * 60 + 40 - (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)))) * 60_000,
  )

const UNPAID: Array<[string, string, string, string, number, number]> = [
  ['Diego Acosta', 'Cancha 2', '2026-09-17', '19:00', 7, TURNO],
  ['Diego Acosta', 'Cancha 2', '2026-09-17', '20:00', 7, TURNO],
  ['Diego Acosta', 'Cancha 2', '2026-09-17', '21:00', 7, TURNO],
  ['Diego Acosta', 'Cancha 2', '2026-09-17', '22:00', 7, TURNO],
  ['Pablo Ruiz', 'Cancha 1', '2026-09-18', '19:00', 6, 12_000 * K],
  ['Leo Castro', 'Cancha 3', '2026-09-18', '19:00', 6, TURNO],
  ['Tomás Ibarra', 'Cancha 4', '2026-09-18', '20:00', 6, TURNO],
  ['Bruno Herrera', 'Cancha 1', '2026-09-18', '20:00', 6, 48_000 * K],
  ['Maxi Godoy', 'Cancha 5', '2026-09-18', '21:00', 6, TURNO],
  ['Fede Luna', 'Cancha 2', '2026-09-19', '15:00', 5, TURNO],
  ['Iván Ríos', 'Cancha 3', '2026-09-19', '18:00', 5, MITAD],
  ['Los del martes', 'Cancha 4', '2026-09-22', '21:00', 2, 75_000 * K],
  ['Emi Suárez', 'Cancha 1', '2026-09-22', '21:00', 2, 21_000 * K],
  ['Joaco Méndez', 'Cancha 5', '2026-09-23', '21:00', 1, TURNO],
  ['Santi Rojas', 'Cancha 2', '2026-09-23', '23:00', 1, 21_000 * K],
  ['Lucho Paredes', 'Cancha 3', '2026-09-24', '22:00', 0, MITAD],
]

const PENDING: StreetMoneyRow[] = [
  {
    origin: 'canteen_tab',
    refId: 'tab1',
    debtorName: 'Cachi',
    pendingCents: 10_500 * K,
    since: daysAgo(0, '22:41'),
    note: null,
  },
  {
    origin: 'canteen_tab',
    refId: 'tab2',
    debtorName: 'Rodri',
    pendingCents: 7_000 * K,
    since: daysAgo(0, '23:09'),
    note: null,
  },
  ...UNPAID.map(([name, court, date, start, ago, cents], i): StreetMoneyRow => ({
    origin: 'booking',
    refId: `b${i}`,
    debtorName: name,
    pendingCents: cents,
    since: daysAgo(ago, start),
    courtName: court,
    date,
    timeStart: `${start}:00`,
    timeEnd: `${String((Number(start.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00:00`,
    playerId: null,
    contactPhone: i % 3 === 0 ? '+54 9 2323 55-0000' : null,
  })),
]

type PageProps = {
  heading: string
  stepperLabel: string
  isToday: boolean
  summary: DaySummary
  pending: StreetMoneyRow[]
  rows: LedgerRow[]
  onCharge: (row: StreetMoneyRow) => void
}

function CuentasPage({
  heading,
  stepperLabel,
  isToday,
  summary,
  pending,
  rows,
  onCharge,
}: PageProps) {
  const stepper = {
    label: stepperLabel,
    prevHref: '/caja/cuentas?dia=2026-09-23',
    nextHref: isToday ? null : '/caja/cuentas',
  }
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
      <div className="space-y-5">
        <CajaTabs
          active="/caja/cuentas"
          actions={<DayStepper {...stepper} className="hidden lg:flex" />}
        />
        <DayStepper {...stepper} className="-mx-2 lg:hidden" />
        <NightSummary heading={heading} summary={summary} />
        <PendingLines
          rows={pending}
          nowMs={NOW_MS}
          onCharge={onCharge}
          onCancelTab={fn()}
          windowNote="Se ven los últimos 12 meses."
        />
        <NightLedger
          rows={rows}
          total={rows.length}
          actions={
            isToday && (
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent md:h-9"
              >
                Registrar movimiento
              </button>
            )
          }
          emptyTitle="Ese día no se registró plata"
          emptyDescription="No hay cobros, ventas ni gastos en ese día."
        />
      </div>
    </AdminLayoutShell>
  )
}

const meta = {
  title: 'Admin/Caja/Cuentas',
  component: CuentasPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/caja/cuentas' } },
  },
  args: {
    heading: 'Entró hoy',
    stepperLabel: 'Hoy · jue 24 sep',
    isToday: true,
    summary: SUMMARY,
    pending: PENDING,
    rows: ROWS,
    onCharge: fn(),
  },
} satisfies Meta<typeof CuentasPage>

export default meta
type Story = StoryObj<typeof meta>

/**
 * La noche entera a la vista: cuánto entró y por dónde, lo que falta cobrar en
 * dos renglones y los movimientos por hora. Ninguna fila dice "deuda".
 */
export const LaNoche: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Entró hoy')).toBeVisible()
    await expect(canvas.getByRole('heading', { name: /Movimientos/ })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /2 fiados sin cobrar/ })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /16 turnos no cobrados/ })).toBeVisible()
    await expect(canvas.queryByText(/deuda/i)).toBeNull()

    // Filtrar por turnos deja solo los 13 cobros de turno.
    await userEvent.click(canvas.getByRole('button', { name: /^Turnos 13/ }))
    const table = canvas.getAllByRole('table')[0]
    if (!table) throw new Error('falta la tabla del libro')
    await expect(within(table).queryByText('AMSTEL x2')).toBeNull()
    await expect(within(table).getAllByText('Nahuel Vega')).toHaveLength(2)
  },
}

/** "Ver y cobrar" abre la lista en un modal, y "Cobrar" pide el cobro de ESA fila. */
export const CobrarUnTurnoNoCobrado: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /16 turnos no cobrados/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Turnos no cobrados' })
    await expect(within(dialog).getAllByRole('listitem')).toHaveLength(16)
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^Cobrar \$\s84\.000 a Joaco/ }),
    )
    await expect(args.onCharge).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'booking', debtorName: 'Joaco Méndez' }),
    )
  },
}

/** Un día pasado sin plata: las flechas dejan volver a hoy y no se puede registrar nada. */
export const DiaSinMovimientos: Story = {
  args: {
    heading: 'Entró el dom 20 sep',
    stepperLabel: 'dom 20 sep',
    isToday: false,
    summary: EMPTY_SUMMARY,
    pending: [],
    rows: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ese día no se registró plata')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Registrar movimiento' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /sin cobrar|no cobrado/ })).toBeNull()
  },
}
