// @vitest-environment happy-dom
//
// Fotos en el alta de una cancha (CourtForm.tsx). Antes el uploader solo existía
// al EDITAR: en "Nueva cancha" no había dónde cargar una foto. Ahora se eligen en
// el alta y se suben a la cancha recién creada, cuando `createAction` devuelve el id.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CourtForm } from '@/app/(admin)/canchas/components/CourtForm'
import { court as courtFixture, openingHours } from '@/test/fixtures'
import { toast } from '@/hooks/use-toast'

vi.mock('@/shared/observability/breadcrumbs', () => ({ track: { courts: vi.fn() } }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@/shared/images/resize-image', () => ({
  resizeToPreset: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
}))

const createAction = vi.fn(async (_fd: FormData, _confirm?: boolean) => ({
  success: true as const,
  courtId: 'court-1',
}))
const uploadPhotoAction = vi.fn(async (_id: string, _fd: FormData) => ({
  success: true as const,
  photos: ['https://media.turnogol.com/t1/courts/court-1/a.webp'],
}))
const onSaved = vi.fn()

const baseProps = {
  tenantId: 'tenant-1',
  openingHours: openingHours(),
  closesNextDay: false,
  otherCourts: [],
  onSaved,
  onCancel: vi.fn(),
  createAction,
  updateAction: vi.fn(async () => ({ success: true as const, courtId: 'court-1' })),
  uploadPhotoAction,
  removePhotoAction: vi.fn(async () => ({ success: true as const, photos: [] })),
  reorderPhotosAction: vi.fn(async () => ({ success: true as const, photos: [] })),
}

// Se pisan solo los dos métodos estáticos: reemplazar el global `URL` entero le
// saca el constructor, y `next/image` (la tarjeta de la vista previa) hace `new URL`.
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview-1')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})

/** Llena nombre + precio del turno (aplica al instante) para que el gate de cobertura deje enviar. */
function fillValidCourt() {
  fireEvent.change(screen.getByPlaceholderText('Ej: Cancha 1'), { target: { value: 'Cancha 9' } })
  fireEvent.change(screen.getByLabelText('Precio del turno'), { target: { value: '10000' } })
}

async function pickPhoto() {
  const input = screen.getByLabelText('Agregar foto') as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
  })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeVisible())
}

describe('CourtForm — fotos en el alta', () => {
  it('cancha nueva ofrece cargar fotos', () => {
    render(<CourtForm court={null} {...baseProps} />)

    expect(screen.getByText('Fotos')).toBeVisible()
    expect(screen.getByLabelText('Agregar foto')).toBeInTheDocument()
  })

  it('muestra cómo sale la cancha sin foto y con foto, y se actualiza al elegirla', async () => {
    render(<CourtForm court={null} {...baseProps} />)

    expect(
      screen.getByText('Sin foto, en tu perfil la cancha sale como un fondo verde.'),
    ).toBeVisible()
    expect(screen.getByText('Así la ve el jugador')).toBeVisible()
    expect(screen.queryByAltText('Cancha Nombre de la cancha')).not.toBeInTheDocument()

    await pickPhoto()

    expect(
      screen.queryByText('Sin foto, en tu perfil la cancha sale como un fondo verde.'),
    ).not.toBeInTheDocument()
    expect(screen.getByAltText('Cancha Nombre de la cancha')).toBeInTheDocument()
  })

  it('la vista previa toma el nombre que se escribe en el form', () => {
    render(<CourtForm court={null} {...baseProps} />)

    fireEvent.change(screen.getByPlaceholderText('Ej: Cancha 1'), { target: { value: 'Cancha 9' } })

    expect(screen.getAllByText('Cancha 9').length).toBeGreaterThan(0)
  })

  it('elegir una foto en el alta no sube nada hasta crear la cancha', async () => {
    render(<CourtForm court={null} {...baseProps} />)

    await pickPhoto()

    expect(uploadPhotoAction).not.toHaveBeenCalled()
  })

  it('al crear, sube las fotos elegidas a la cancha nueva y las pasa a onSaved', async () => {
    render(<CourtForm court={null} {...baseProps} />)
    fillValidCourt()
    await pickPhoto()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cancha' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(createAction).toHaveBeenCalledTimes(1)
    expect(uploadPhotoAction).toHaveBeenCalledTimes(1)
    const [courtId, fd] = uploadPhotoAction.mock.calls[0]!
    expect(courtId).toBe('court-1')
    expect(fd.get('file')).toBeInstanceOf(Blob)
    // La cancha se crea primero y recién después se sube la foto.
    expect(createAction.mock.invocationCallOrder[0]).toBeLessThan(
      uploadPhotoAction.mock.invocationCallOrder[0]!,
    )
    expect(onSaved.mock.calls[0]![0]).toMatchObject({
      id: 'court-1',
      photos: ['https://media.turnogol.com/t1/courts/court-1/a.webp'],
    })
    expect(toast).not.toHaveBeenCalled()
  })

  it('sin fotos elegidas no llama a la action de subida', async () => {
    render(<CourtForm court={null} {...baseProps} />)
    fillValidCourt()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cancha' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(uploadPhotoAction).not.toHaveBeenCalled()
    expect(onSaved.mock.calls[0]![0]).toMatchObject({ photos: [] })
  })

  it('si la foto falla, la cancha igual se crea y se avisa cuál no subió', async () => {
    uploadPhotoAction.mockResolvedValueOnce({
      success: false,
      error: 'La imagen no puede superar 2MB',
    } as never)
    render(<CourtForm court={null} {...baseProps} />)
    fillValidCourt()
    await pickPhoto()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cancha' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: expect.stringContaining('una foto no se subió'),
        description: expect.stringContaining('La imagen no puede superar 2MB'),
      }),
    )
    expect(onSaved.mock.calls[0]![0]).toMatchObject({ photos: [] })
  })

  it('si la subida tira excepción (red caída), no rompe el alta: onSaved igual y se avisa', async () => {
    uploadPhotoAction.mockRejectedValueOnce(new Error('Failed to fetch'))
    render(<CourtForm court={null} {...baseProps} />)
    fillValidCourt()
    await pickPhoto()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cancha' }))

    // Si la excepción escapara, onSaved no se llamaría y reenviar crearía otra cancha.
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(createAction).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: expect.stringContaining('una foto no se subió'),
      }),
    )
  })

  it('con aviso de cuota, las fotos se suben una sola vez y recién al confirmar', async () => {
    createAction.mockResolvedValueOnce({
      success: false,
      error: 'sube la cuota',
      requiresBillingConfirmation: {
        currentBilledCourts: 2,
        nextBilledCourts: 3,
        currentMonthlyCents: 0,
        nextMonthlyCents: 0,
        isTrialing: false,
      },
    } as never)
    render(<CourtForm court={null} {...baseProps} />)
    fillValidCourt()
    await pickPhoto()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cancha' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(createAction).toHaveBeenCalledTimes(2)
    expect(createAction.mock.calls[1]![1]).toBe(true)
    expect(uploadPhotoAction).toHaveBeenCalledTimes(1)
  })

  it('quitar una foto elegida la saca de la lista y libera el blob', async () => {
    render(<CourtForm court={null} {...baseProps} />)
    await pickPhoto()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Quitar imagen' })).not.toBeInTheDocument(),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })

  it('en edición, onSaved lleva las fotos actuales y no las que vinieron con la cancha', async () => {
    const existing = courtFixture({ photos: ['https://media.turnogol.com/t1/courts/c1/old.webp'] })
    render(
      <CourtForm
        court={existing}
        {...baseProps}
        removePhotoAction={vi.fn(async () => ({ success: true as const, photos: [] }))}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Quitar imagen' })).not.toBeInTheDocument(),
    )
    // El h1 al editar muestra el NOMBRE de la cancha, no "Editar cancha", y
    // quedó fuera del <form>: se ancla en el botón de submit.
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }).closest('form')!)

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0]![0]).toMatchObject({ photos: [] })
    expect(uploadPhotoAction).not.toHaveBeenCalled()
  })
})
