// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { courtFutbol5, courtOffline, openingHours } from '@/test/fixtures'
import type { CourtActionResult } from '@/app/(admin)/canchas/actions'

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

import { CourtList } from '@/app/(admin)/canchas/components/CourtList'

type ToastArg = { title: string; action?: { label: string; onClick: () => void } }

const toggleStatusAction = vi.fn(async (): Promise<CourtActionResult> => ({
  success: true,
  courtId: 'court-1',
}))
const failOnce = () =>
  toggleStatusAction.mockImplementationOnce(async () => ({ success: false, error: 'Falló la red' }))

function renderList(initialCourts: ReturnType<typeof courtOffline>[]) {
  return render(
    <CourtList
      initialCourts={initialCourts}
      tenantId="tenant-test"
      openingHours={openingHours()}
      closesNextDay={false}
      isAdmin
      tenantName="Complejo Fénix"
      toggleStatusAction={toggleStatusAction}
      getDeactivationImpactAction={vi.fn(async () => ({
        success: true as const,
        futureBookings: 0,
        activeAbonados: 0,
      }))}
      createAction={vi.fn(async () => ({ success: true as const, courtId: 'court-1' }))}
      updateAction={vi.fn(async () => ({ success: true as const, courtId: 'court-1' }))}
      uploadPhotoAction={vi.fn(async () => ({ success: true as const, photos: [] }))}
      removePhotoAction={vi.fn(async () => ({ success: true as const, photos: [] }))}
      reorderPhotosAction={vi.fn(async () => ({ success: true as const, photos: [] }))}
    />,
  )
}

/** Devuelve la action "Deshacer" del último toast con ese título. */
async function undoFromToast(title: string) {
  await waitFor(() =>
    expect(toastMock.mock.calls.some(([t]) => (t as ToastArg).title === title)).toBe(true),
  )
  const call = toastMock.mock.calls.filter(([t]) => (t as ToastArg).title === title).at(-1)
  const action = (call?.[0] as ToastArg).action
  expect(action?.label).toBe('Deshacer')
  return action!.onClick
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

// El "Deshacer" del toast es el closure del render en que se mostró el toast.
// Si el revert de un Deshacer fallido sale de `currentStatus` capturado ahí, la
// tarjeta vuelve al estado VIEJO y queda mintiendo sobre lo que hay en el server.
describe('CourtList — Deshacer fallido deja la tarjeta en el estado real', () => {
  it('Activar → Deshacer falla: sigue Activa con botón Desactivar', async () => {
    renderList([courtOffline()])
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    await screen.findByRole('button', { name: 'Desactivar' })

    const undo = await undoFromToast('Cancha activada')
    failOnce()
    await act(async () => undo())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No se pudo desactivar' }),
      ),
    )
    expect(toggleStatusAction).toHaveBeenLastCalledWith(courtOffline().id, 'offline')
    expect(await screen.findByRole('button', { name: 'Desactivar' })).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.queryByText('Pausada')).not.toBeInTheDocument()
  })

  it('Desactivar (diálogo) → Deshacer falla: sigue Pausada con botón Activar', async () => {
    renderList([courtFutbol5()])
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    // ConfirmDialog entra por next/dynamic: el primer mount paga el cold-start
    // del chunk (~1.5s, ver abonados-list.test.tsx), más que el default de RTL.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }))
    await screen.findByRole('button', { name: 'Activar' })

    const undo = await undoFromToast('Cancha desactivada')
    failOnce()
    await act(async () => undo())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No se pudo activar' }),
      ),
    )
    expect(toggleStatusAction).toHaveBeenLastCalledWith(courtFutbol5().id, 'online')
    expect(await screen.findByRole('button', { name: 'Activar' })).toBeInTheDocument()
    expect(screen.getByText('Pausada')).toBeInTheDocument()
    expect(screen.queryByText('Activa')).not.toBeInTheDocument()
  })
})
