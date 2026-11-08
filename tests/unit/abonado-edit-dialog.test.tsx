// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { AbonadoEditDialog } from '@/app/(admin)/abonados/AbonadoEditDialog'
import { toast } from '@/hooks/use-toast'
import type { AbonadoRow } from '@/modules/abonados/abonado.types'

const ABONADO: AbonadoRow = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenantId: 'tttttttt-0000-0000-0000-000000000001',
  courtId: 'court-1',
  playerId: null,
  contactName: 'Cachi',
  contactPhone: '1122334455',
  dayOfWeek: 2,
  timeStart: '21:00:00',
  timeEnd: '22:00:00',
  pricePerSession: 2_000_000,
  startsOn: new Date('2030-01-01'),
  endsOn: null,
  status: 'active',
  paymentMethod: 'cash',
  createdAt: new Date('2030-01-01'),
  updatedAt: new Date('2030-01-01'),
}

const COURTS = [
  { id: 'court-1', name: 'Cancha 1' },
  { id: 'court-2', name: 'Cancha 2' },
]

const PREVIEW_OK = {
  futureSessions: 8,
  priceUpdated: 7,
  keptOwnPrice: 1,
  keptPaid: 0,
  moved: 0,
  notMoved: 0,
  conflictDates: [],
  fixedConflict: false,
}

function setup(over: Partial<React.ComponentProps<typeof AbonadoEditDialog>> = {}) {
  const previewAction = vi.fn(async () => ({ success: true as const, preview: PREVIEW_OK }))
  const updateAction = vi.fn(async () => ({
    success: true as const,
    abonado: ABONADO,
    counts: { futureSessions: 8, priceUpdated: 7, keptOwnPrice: 1, keptPaid: 0, moved: 0 },
  }))
  const onOpenChange = vi.fn()
  render(
    <AbonadoEditDialog
      open
      onOpenChange={onOpenChange}
      abonado={ABONADO}
      courts={COURTS}
      previewAction={previewAction}
      updateAction={updateAction}
      {...over}
    />,
  )
  return { previewAction, updateAction, onOpenChange }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AbonadoEditDialog', () => {
  it('dice a quién y a cuántas fechas aplica, y arranca sin cambios', () => {
    setup()
    expect(screen.getByText('Editar el fijo de Cachi (martes 21:00)')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Los cambios valen para todas las fechas que vienen. Las fechas pasadas no cambian.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('No cambiaste nada.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar en todas las fechas' })).toBeDisabled()
  })

  it('cambiar el nombre pide la vista previa y muestra lo que se queda como está', async () => {
    const { previewAction } = setup()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cachi Gómez' } })

    expect(await screen.findByText('El precio cambia en 7 fechas.')).toBeInTheDocument()
    expect(
      screen.getByText('1 fecha se queda con el precio que le pusiste a mano.'),
    ).toBeInTheDocument()
    expect(previewAction).toHaveBeenCalledWith(ABONADO.id, { contactName: 'Cachi Gómez' })
  })

  it('guarda solo lo que cambió y avisa en cuántas fechas', async () => {
    const { updateAction, onOpenChange } = setup()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '1133445566' } })

    const save = screen.getByRole('button', { name: 'Guardar en todas las fechas' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() =>
      expect(updateAction).toHaveBeenCalledWith(ABONADO.id, { contactPhone: '1133445566' }),
    )
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Turno fijo actualizado. Cambió en 7 fechas.',
        variant: 'success',
      }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('no deja guardar con el nombre vacío', () => {
    const { previewAction } = setup()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '  ' } })
    expect(screen.getByText('Ingresá el nombre.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar en todas las fechas' })).toBeDisabled()
    expect(previewAction).not.toHaveBeenCalled()
  })

  it('si cambia el horario, el botón dice que mueve todas las fechas', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '20:00' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '21:00' } })
    expect(screen.getByRole('button', { name: 'Mover todas las fechas' })).toBeInTheDocument()
  })

  it('con fechas ocupadas las lista y no deja mover', async () => {
    setup({
      previewAction: vi.fn(async () => ({
        success: true as const,
        preview: {
          ...PREVIEW_OK,
          priceUpdated: 0,
          keptOwnPrice: 0,
          conflictDates: ['2030-01-16', '2030-01-23'],
        },
      })),
    })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '20:00' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '21:00' } })

    expect(
      await screen.findByText(
        'No se puede mover porque hay fechas que no están disponibles. Liberalas o elegí otro horario.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('16/01')).toBeInTheDocument()
    expect(screen.getByText('23/01')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mover todas las fechas' })).toBeDisabled()
  })

  it('un fijo a nombre de una cuenta avisa que el nombre sale de la cuenta', () => {
    setup({ abonado: { ...ABONADO, playerId: 'player-1' } })
    expect(
      screen.getByText(
        'Este fijo está a nombre de una cuenta. El nombre que ve el jugador sale de su cuenta.',
      ),
    ).toBeInTheDocument()
  })

  it('el aviso de choque del servidor se va cuando el encargado cambia los datos', async () => {
    setup({
      updateAction: vi.fn(async () => ({
        success: false as const,
        error:
          'Hay fechas que no se pueden usar en el nuevo horario. Liberalas o elegí otro horario.',
        conflictDates: ['2030-01-16'],
      })),
    })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '20:00' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '21:00' } })
    const save = screen.getByRole('button', { name: 'Mover todas las fechas' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    expect(await screen.findByText('16/01')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '19:00' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '20:00' } })
    await waitFor(() => expect(screen.queryByText('16/01')).toBeNull())
  })

  it('muestra el error del servidor sin cerrar el diálogo', async () => {
    const { onOpenChange } = setup({
      updateAction: vi.fn(async () => ({
        success: false as const,
        error: 'Solo se puede editar un turno fijo activo.',
      })),
    })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } })
    const save = screen.getByRole('button', { name: 'Guardar en todas las fechas' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    expect(
      await screen.findByText('Solo se puede editar un turno fijo activo.'),
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
