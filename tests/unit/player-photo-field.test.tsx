// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const resize = vi.hoisted(() => vi.fn())
vi.mock('@/shared/images/resize-image', () => ({ resizeToPreset: resize }))

import { PlayerPhotoField } from '@/components/rival/PlayerPhotoField'
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
    const { uploadAction } = setup()
    const file = new File(['raw'], 'yo.png', { type: 'image/png' })
    fireEvent.change(fileInput(), { target: { files: [file] } })
    await waitFor(() => expect(uploadAction).toHaveBeenCalledTimes(1))
    expect(resize).toHaveBeenCalledWith(file, 'logo')
    expect(uploadAction.mock.calls[0]![0].get('file')).toBeInstanceOf(Blob)
    await waitFor(() => expect(document.querySelector(`img[src="${URL_OK}"]`)).not.toBeNull())
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

  it('si el archivo no se puede procesar, lo dice y no llama a la action', async () => {
    resize.mockRejectedValue(new Error('El archivo debe ser una imagen'))
    const { uploadAction } = setup()
    fireEvent.change(fileInput(), {
      target: { files: [new File(['raw'], 'yo.txt', { type: 'text/plain' })] },
    })
    expect((await screen.findByRole('alert')).textContent).toContain('imagen')
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
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(document.querySelector(`img[src="${URL_OK}"]`)).not.toBeNull()
  })
})
