// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const resize = vi.hoisted(() => vi.fn())
// La clase de error es la real: el componente la reconoce con `instanceof`.
vi.mock('@/shared/images/resize-image', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resizeToPreset: resize,
}))

import { PlayerPhotoField } from '@/components/rival/PlayerPhotoField'
import { ImageResizeError } from '@/shared/images/resize-image'
import type { RivalPhotoResult } from '@/app/(player)/rival/photo-actions'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const URL_OK = 'https://media.example.test/rival/avatars/a.webp'

function setup(over: Partial<Parameters<typeof PlayerPhotoField>[0]> = {}) {
  const uploadAction = vi.fn(async (_fd: FormData): Promise<RivalPhotoResult> => ({
    success: true,
    url: URL_OK,
  }))
  const removeAction = vi.fn(async (): Promise<RivalPhotoResult> => ({ success: true, url: null }))
  render(
    <PlayerPhotoField
      url={null}
      initials="LF"
      uploadAction={uploadAction}
      removeAction={removeAction}
      {...over}
    />,
  )
  return { uploadAction, removeAction }
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

describe('PlayerPhotoField', () => {
  it('sin foto: iniciales, "Subir foto" y nada de "Quitar"', () => {
    setup()
    expect(screen.getByText('LF')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subir foto' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull()
    expect(fileInput().accept).toBe('image/png,image/jpeg,image/webp')
  })

  it('con foto: la muestra, y ofrece "Cambiar foto" y "Quitar"', () => {
    setup({ url: URL_OK })
    expect(document.querySelector(`img[src="${URL_OK}"]`)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeTruthy()
  })

  it('elegir un archivo lo recorta y llama a la action con un Blob', async () => {
    resize.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    // happy-dom pierde el nombre al guardar un Blob: se mira lo que le pasa el componente.
    const set = vi.spyOn(FormData.prototype, 'set')
    const { uploadAction } = setup()
    const file = new File(['raw'], 'yo.png', { type: 'image/png' })
    fireEvent.change(fileInput(), { target: { files: [file] } })
    await waitFor(() => expect(uploadAction).toHaveBeenCalledTimes(1))
    expect(resize).toHaveBeenCalledWith(file, 'logo', { jpegFallback: true })
    expect(uploadAction.mock.calls[0]![0].get('file')).toBeInstanceOf(Blob)
    expect(set).toHaveBeenCalledWith('file', expect.any(Blob), 'foto.webp')
    set.mockRestore()
    await waitFor(() => expect(document.querySelector(`img[src="${URL_OK}"]`)).not.toBeNull())
  })

  it('si el recorte sale en JPEG (Safari), el archivo se llama foto.jpg', async () => {
    resize.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    const set = vi.spyOn(FormData.prototype, 'set')
    const { uploadAction } = setup()
    fireEvent.change(fileInput(), {
      target: { files: [new File(['raw'], 'IMG_0001.jpeg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(uploadAction).toHaveBeenCalledTimes(1))
    expect(set).toHaveBeenCalledWith('file', expect.any(Blob), 'foto.jpg')
    set.mockRestore()
  })

  it('si la action falla, el error se ve en un alert y la foto no cambia', async () => {
    resize.mockResolvedValue(new Blob(['x']))
    const { uploadAction } = setup()
    uploadAction.mockResolvedValue({ success: false, error: 'La foto pesa demasiado.' })
    fireEvent.change(fileInput(), {
      target: { files: [new File(['raw'], 'yo.png', { type: 'image/png' })] },
    })
    expect((await screen.findByRole('alert')).textContent).toBe('La foto pesa demasiado.')
    expect(document.querySelector('img')).toBeNull()
  })

  it('si la foto no se puede leer, lo dice (no culpa a la conexión) y no llama a la action', async () => {
    resize.mockRejectedValue(new ImageResizeError('No se pudo leer la imagen'))
    const { uploadAction } = setup()
    fireEvent.change(fileInput(), {
      target: { files: [new File(['raw'], 'yo.heic', { type: 'image/heic' })] },
    })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos leer esa foto. Probá con otra.',
    )
    expect(uploadAction).not.toHaveBeenCalled()
  })

  it('"Quitar" llama a la action y vuelve a las iniciales', async () => {
    const { removeAction } = setup({ url: URL_OK })
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(removeAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Subir foto' })).toBeTruthy())
    expect(screen.getByText('LF')).toBeTruthy()
  })

  it('una excepción de la action (sin red) también cae en el alert', async () => {
    const { removeAction } = setup({ url: URL_OK })
    removeAction.mockRejectedValue(new Error('network'))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos conectar. Revisá tu conexión y probá de nuevo.',
    )
    expect(document.querySelector(`img[src="${URL_OK}"]`)).not.toBeNull()
  })
})
