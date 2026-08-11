// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ImageUploader } from '@/components/ui/image-uploader'

vi.mock('@/shared/images/resize-image', () => ({
  resizeToPreset: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/webp' })),
  PRESET_CONFIG: {
    logo: { aspect: 1, maxWidth: 512 },
    cover: { aspect: 16 / 9, maxWidth: 1600 },
    court: { aspect: 4 / 3, maxWidth: 1280 },
  },
}))

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview') })
})

describe('ImageUploader — logo/cover (value: string)', () => {
  it('estado vacío muestra el emptyLabel y ningún botón de borrar', () => {
    render(
      <ImageUploader
        preset="logo"
        value=""
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        emptyLabel="Subí el logo de tu complejo"
      />,
    )
    expect(screen.getByText('Subí el logo de tu complejo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
  })

  it('elegir un archivo llama onUpload con el blob redimensionado', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined)
    render(
      <ImageUploader
        preset="logo"
        value=""
        onUpload={onUpload}
        onRemove={vi.fn()}
        emptyLabel="Subí el logo"
      />,
    )
    const input = screen.getByLabelText(/subí el logo/i) as HTMLInputElement
    const file = new File(['x'], 'logo.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1))
    expect(onUpload.mock.calls[0][0]).toBeInstanceOf(Blob)
  })

  it('con value seteado muestra botón de borrar', () => {
    render(
      <ImageUploader
        preset="cover"
        value="https://media.turnogol.com/t1/cover-a.webp"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        emptyLabel="Subí una portada"
      />,
    )
    expect(screen.getByRole('button', { name: /quitar/i })).toBeInTheDocument()
  })
})

describe('ImageUploader — court (value: string[])', () => {
  it('respeta el máximo: oculta el dropzone al llegar a `max`', () => {
    const photos = Array.from(
      { length: 6 },
      (_, i) => `https://media.turnogol.com/t1/courts/c1/${i}.webp`,
    )
    render(
      <ImageUploader
        preset="court"
        value={photos}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        max={6}
        emptyLabel="Agregar foto"
      />,
    )
    expect(screen.queryByLabelText(/agregar foto/i)).not.toBeInTheDocument()
  })

  it('muestra contador de fotos', () => {
    const photos = ['https://media.turnogol.com/t1/courts/c1/0.webp']
    render(
      <ImageUploader
        preset="court"
        value={photos}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        max={6}
        emptyLabel="Agregar foto"
      />,
    )
    expect(screen.getByText('1/6')).toBeInTheDocument()
  })

  it('con 1 sola foto no muestra botones de reordenar', () => {
    const photos = ['https://media.turnogol.com/t1/courts/c1/0.webp']
    render(
      <ImageUploader
        preset="court"
        value={photos}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        max={6}
        emptyLabel="Agregar foto"
      />,
    )
    expect(screen.queryByRole('button', { name: /mover a la izquierda/i })).not.toBeInTheDocument()
  })

  it('con 2+ fotos, mover la segunda a la izquierda llama onReorder con el array swappeado', async () => {
    const photos = [
      'https://media.turnogol.com/t1/courts/c1/a.webp',
      'https://media.turnogol.com/t1/courts/c1/b.webp',
    ]
    const onReorder = vi.fn().mockResolvedValue(undefined)
    render(
      <ImageUploader
        preset="court"
        value={photos}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
        max={6}
        emptyLabel="Agregar foto"
      />,
    )
    const leftButtons = screen.getAllByRole('button', { name: /mover a la izquierda/i })
    fireEvent.click(leftButtons[0]!)
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith([photos[1], photos[0]]))
  })
})
