import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { formatArs } from '@/lib/format'
import { Th, Td, Tr } from './table'

const ROWS = [
  { id: '1', name: 'Cancha 1', bookings: 12, income: 4500000 },
  { id: '2', name: 'Cancha 2', bookings: 8, income: 2800000 },
  { id: '3', name: 'Cancha 3', bookings: 15, income: 6200000 },
]

const meta = {
  title: 'Design System/Table',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** `Th`/`Td`/`Tr`: cabecera en mayúsculas, celdas `p-3`, cifras a la derecha y tabulares. */
export const Default: Story = {
  render: () => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          <Th>Cancha</Th>
          <Th align="right">Reservas</Th>
          <Th align="right">Ingresos</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {ROWS.map((row) => (
          <Tr key={row.id}>
            <Td>{row.name}</Td>
            <Td numeric>{row.bookings}</Td>
            <Td numeric>{formatArs(row.income)}</Td>
          </Tr>
        ))}
      </tbody>
    </table>
  ),
}
