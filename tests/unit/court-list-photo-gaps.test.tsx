// @vitest-environment happy-dom
//
// Miniatura "Agregar foto a {cancha}" en /canchas (CourtList.tsx). Nada bloquea
// crear una cancha sin foto y en el perfil público sale como un fondo verde
// vacío: sin esta miniatura el dueño no se entera de cuáles le faltan.
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

describe('CourtList — miniatura de canchas sin foto', () => {
  it('ninguna con foto: cada cancha tiene su botón para agregar', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' }), court({ id: 'c2', name: 'Cancha 2' })])

    expect(screen.getByRole('button', { name: 'Agregar foto a Cancha 1' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Agregar foto a Cancha 2' })).toBeVisible()
  })

  it('algunas con foto: el botón sale solo en las que faltan', () => {
    renderList([
      court({ id: 'c1', name: 'Cancha 1', photos: [PHOTO] }),
      court({ id: 'c2', name: 'Cancha 2' }),
    ])

    expect(
      screen.queryByRole('button', { name: 'Agregar foto a Cancha 1' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar foto a Cancha 2' })).toBeVisible()
  })

  it('todas con foto: no hay ningún botón para agregar', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1', photos: [PHOTO] })])

    expect(screen.queryByRole('button', { name: /Agregar foto a/ })).not.toBeInTheDocument()
  })

  it('el manager no lo ve como botón: es un texto, no puede editar', () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' })], false)

    expect(screen.queryByRole('button', { name: /Agregar foto a/ })).not.toBeInTheDocument()
    expect(screen.getByText('Sin foto')).toBeVisible()
  })

  it('"Agregar foto a X" abre el editor de esa cancha', async () => {
    renderList([court({ id: 'c1', name: 'Cancha 1' })])

    fireEvent.click(screen.getByRole('button', { name: 'Agregar foto a Cancha 1' }))

    expect(
      await screen.findByRole('heading', { name: 'Cancha 1' }, { timeout: 10_000 }),
    ).toBeVisible()
  })

  // La foto se guarda en la DB apenas se elige. Si "Cancelar" dejara `courts` como
  // estaba, la lista seguiría marcando "sin foto" con la foto ya subida.
  it('subir una foto y cerrar con "Cancelar" ya no muestra el botón de agregar', async () => {
    renderList(
      [court({ id: 'c1', name: 'Cancha 1' })],
      true,
      vi.fn(async () => ({ success: true as const, photos: [PHOTO] })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar foto a Cancha 1' }))
    await screen.findByRole('heading', { name: 'Cancha 1' }, { timeout: 10_000 })

    fireEvent.change(screen.getByLabelText('Agregar foto'), {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      screen.queryByRole('button', { name: 'Agregar foto a Cancha 1' }),
    ).not.toBeInTheDocument()
  })
})
