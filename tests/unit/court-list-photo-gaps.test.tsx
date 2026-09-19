// @vitest-environment happy-dom
//
// Aviso de canchas sin foto en /canchas (CourtList.tsx). Nada bloquea crear una
// cancha sin foto y en el perfil público sale como un fondo verde vacío: sin este
// aviso el dueño no se entera.
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { court, openingHours } from '@/test/fixtures'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@/shared/images/resize-image', () => ({
  resizeToPreset: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
}))

import { CourtList } from '@/app/(admin)/canchas/components/CourtList'

const PHOTO = 'https://media.turnogol.com/t1/courts/c1/a.webp'

function renderList(
  initialCourts: ReturnType<typeof court>[],
  isAdmin = true,
  uploadPhotoAction = vi.fn(async () => ({ success: true as const, photos: [] as string[] })),
) {
  return render(
    <CourtList
      initialCourts={initialCourts}
      tenantId="tenant-test"
      openingHours={openingHours()}
      closesNextDay={false}
      isAdmin={isAdmin}
      tenantName="Complejo Fénix"
      toggleStatusAction={vi.fn(async () => ({ success: true as const, courtId: 'c' }))}
      getDeactivationImpactAction={vi.fn(async () => ({
        success: true as const,
        futureBookings: 0,
        activeAbonados: 0,
      }))}
      createAction={vi.fn(async () => ({ success: true as const, courtId: 'c' }))}
      updateAction={vi.fn(async () => ({ success: true as const, courtId: 'c' }))}
      uploadPhotoAction={uploadPhotoAction}
      removePhotoAction={vi.fn(async () => ({ success: true as const, photos: [] }))}
      reorderPhotosAction={vi.fn(async () => ({ success: true as const, photos: [] }))}
    />,
  )
}

afterEach(cleanup)

describe('CourtList — canchas sin foto', () => {
  it('ninguna con foto: avisa arriba y marca cada cancha', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' }), court({ id: 'c2', name: 'Cancha 2' })])

    expect(screen.getByText(/Ninguna de tus canchas tiene foto\./)).toBeVisible()
    expect(screen.getAllByRole('button', { name: /Sin foto · agregar/ })).toHaveLength(2)
  })

  it('una sola cancha sin foto: habla en singular', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' })])

    expect(screen.getByText(/Tu cancha no tiene foto\./)).toBeVisible()
  })

  it('algunas con foto: cuenta cuántas faltan y marca solo esas', () => {
    renderList([
      court({ id: 'c1', name: 'Cancha 1', photos: [PHOTO] }),
      court({ id: 'c2', name: 'Cancha 2' }),
    ])

    expect(screen.getByText(/1 de 2 canchas sin foto\./)).toBeVisible()
    expect(screen.getAllByRole('button', { name: /Sin foto · agregar/ })).toHaveLength(1)
  })

  it('todas con foto: no avisa nada', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1', photos: [PHOTO] })])

    expect(screen.queryByText(/sin foto|no tiene foto|tiene foto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sin foto · agregar/ })).not.toBeInTheDocument()
  })

  it('el manager no lo ve: no puede editar la cancha', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' })], false)

    expect(screen.queryByText(/no tiene foto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sin foto · agregar/ })).not.toBeInTheDocument()
  })

  it('"Sin foto · agregar" abre el editor de esa cancha', async () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' })])

    fireEvent.click(screen.getByRole('button', { name: /Sin foto · agregar/ }))

    expect(
      await screen.findByRole('heading', { name: 'Editar cancha' }, { timeout: 10_000 }),
    ).toBeVisible()
  })

  // La foto se guarda en la DB apenas se elige. Si "Cancelar" dejara `courts` como
  // estaba, la lista seguiría marcando "sin foto" con la foto ya subida.
  it('subir una foto y cerrar con "Cancelar" ya no deja la cancha marcada sin foto', async () => {
    renderList(
      [court({ id: 'c1', name: 'Cancha 1' })],
      true,
      vi.fn(async () => ({ success: true as const, photos: [PHOTO] })),
    )
    fireEvent.click(screen.getByRole('button', { name: /Sin foto · agregar/ }))
    await screen.findByRole('heading', { name: 'Editar cancha' }, { timeout: 10_000 })

    fireEvent.change(screen.getByLabelText('Agregar foto'), {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByText(/no tiene foto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sin foto · agregar/ })).not.toBeInTheDocument()
  })
})
