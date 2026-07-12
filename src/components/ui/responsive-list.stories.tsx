import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ResponsiveList } from './responsive-list'

/**
 * Composición: cards (mobile, <640px) + tabla (desktop, sm+) dentro de un
 * borde común (`rounded-lg border bg-card`) — reproduce /jugadores, la
 * página real que la usa. La tabla va primero en el DOM (contrato para e2e
 * de escritorio) aunque solo se vea una vista por breakpoint.
 * `layout: 'fullscreen'` para poder mostrar ambos breakpoints sin que
 * Storybook centre/recorte el ancho.
 */
const players = [
  { id: '1', name: 'Tomás Herrera', contact: '11 2345-6789', bookings: 12, noshows: 0 },
  { id: '2', name: 'Rodrigo Álvarez', contact: 'rodri@example.com', bookings: 5, noshows: 1 },
  { id: '3', name: 'Marcelo Suárez', contact: '11 9876-5432', bookings: 28, noshows: 0 },
]

function Cards() {
  return (
    <ul className="divide-y divide-border">
      {players.map((p) => (
        <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.contact} · {p.bookings} reservas
            </p>
          </div>
          {p.noshows > 0 && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              {p.noshows} ausencia{p.noshows !== 1 ? 's' : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Table() {
  return (
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th className="px-4 py-2.5 font-medium">Jugador</th>
          <th className="px-4 py-2.5 font-medium">Contacto</th>
          <th className="px-4 py-2.5 font-medium">Reservas</th>
          <th className="px-4 py-2.5 font-medium">Ausencias</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {players.map((p) => (
          <tr key={p.id} className="hover:bg-accent">
            <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
            <td className="px-4 py-2.5 text-muted-foreground">{p.contact}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.bookings}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.noshows || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const meta = {
  title: 'Patterns/ResponsiveList',
  component: ResponsiveList,
  parameters: { layout: 'fullscreen' },
  args: { cards: <Cards />, table: <Table /> },
  decorators: [(Story) => <div className="max-w-2xl p-6"><Story /></div>],
} satisfies Meta<typeof ResponsiveList>

export default meta
type Story = StoryObj<typeof meta>

/** Ambas vistas conviven en el DOM; CSS (`hidden sm:block` / `sm:hidden`) decide cuál se ve. */
export const Default: Story = {}

export const ConHeader: Story = {
  args: {
    header: (
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Jugadores</h3>
        <span className="text-xs text-muted-foreground">{players.length} resultados</span>
      </div>
    ),
  },
}
