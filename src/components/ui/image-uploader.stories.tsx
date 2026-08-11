import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ImageUploader } from './image-uploader'

/** SVG data-uri de color plano — sustituye una foto real para no depender de assets externos. */
function placeholder(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/** PNG 1×1 real (no un mock) — `resizeToPreset` decodifica vía `<img>`/`<canvas>` reales del browser. */
function pngFile(name = 'foto.png'): File {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new File([bytes], name, { type: 'image/png' })
}

function textFile(): File {
  return new File(['no soy una imagen'], 'documento.txt', { type: 'text/plain' })
}

/**
 * `resizeToPreset` (`@/shared/images/resize-image`) usa `Image`/`<canvas>`
 * reales del navegador — corre tal cual bajo el runner de Storybook
 * (Playwright, no jsdom), así que los `play` de esta story suben archivos
 * reales en vez de mockear el procesamiento.
 */
const meta = {
  title: 'Design System/ImageUploader',
  component: ImageUploader,
  parameters: { layout: 'centered' },
  args: {
    preset: 'logo',
    value: '',
    emptyLabel: 'Subí el logo de tu complejo',
    onUpload: fn(async (_blob: Blob) => {}),
    onRemove: fn(async (_url: string) => {}),
  },
} satisfies Meta<typeof ImageUploader>

export default meta
type Story = StoryObj<typeof meta>

export const Vacio: Story = {}

export const ImagenUnica: Story = {
  args: { value: placeholder('#10b981') },
}

/** Los 3 presets (logo 1:1, cover 16:9, court 4:3) uno al lado del otro. */
export const Presets: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">logo</p>
        <ImageUploader {...args} preset="logo" value={placeholder('#10b981')} emptyLabel="Logo" />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">cover</p>
        <ImageUploader
          {...args}
          preset="cover"
          value={placeholder('#047857')}
          emptyLabel="Portada"
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">court</p>
        <ImageUploader
          {...args}
          preset="court"
          value={placeholder('#065f46')}
          emptyLabel="Foto de cancha"
        />
      </div>
    </div>
  ),
}

/** Multi (varias fotos por cancha) con contador X/max y flechas de reorden. */
export const MultiConContador: Story = {
  args: {
    preset: 'court',
    value: [placeholder('#10b981'), placeholder('#047857')],
    max: 5,
    emptyLabel: 'Agregar foto',
    onReorder: fn(async (_urls: string[]) => {}),
  },
}

/** `atMax`: la cantidad de imágenes llegó al `max` → el dropzone desaparece. */
export const AlMaximo: Story = {
  args: {
    preset: 'court',
    value: [placeholder('#10b981'), placeholder('#047857')],
    max: 2,
    emptyLabel: 'Agregar foto',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText('Agregar foto')).not.toBeInTheDocument()
  },
}

export const Disabled: Story = {
  args: { value: placeholder('#10b981'), disabled: true },
}

/**
 * `onUpload` nunca resuelve: tras subir un archivo válido, el spinner queda
 * fijo y el input de archivo se deshabilita (`busy`).
 */
export const Subiendo: Story = {
  args: { onUpload: fn((_blob: Blob) => new Promise<void>(() => {})) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Subí el logo de tu complejo')
    await userEvent.upload(input, pngFile())
    await expect(input).toBeDisabled()
  },
}

/** Subir un archivo que no es imagen dispara el error de validación real de `resizeToPreset`. */
export const ErrorDeProcesamiento: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Subí el logo de tu complejo')
    // applyAccept:false — por default userEvent.upload filtra el archivo contra
    // el atributo `accept` del input ANTES de dispararlo (simula el file picker
    // del navegador) y nunca llega a onChange, así que nunca se ejercita la
    // validación real de resizeToPreset. Acá se quiere probar esa validación.
    await userEvent.upload(input, textFile(), { applyAccept: false })
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'El archivo debe ser una imagen',
    )
  },
}

/** Subida exitosa de principio a fin: llega un PNG real, se resuelve el resize y se llama `onUpload` con el blob resultante. */
export const SubidaExitosa: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Subí el logo de tu complejo')
    await userEvent.upload(input, pngFile())
    // resizeToPreset decodifica la imagen y reencodea a webp en un <canvas>
    // real (Image.onload + canvas.toBlob): async de verdad, no resuelve en el
    // mismo tick que el upload.
    await waitFor(() => expect(args.onUpload).toHaveBeenCalledWith(expect.any(Blob)))
  },
}
