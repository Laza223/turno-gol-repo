// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/hooks/use-art-now', () => ({
  computeArtNow: () => ({ date: '2026-09-29' }),
}))

import { StoryShareDialog } from '@/app/(admin)/grilla/_components/StoryShareDialog'

const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })

function pngResponse() {
  return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: 'X', message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()
const trackAction = vi.fn()
const onClose = vi.fn()

function renderDialog(bookingAdvanceDays = 6) {
  return render(
    <StoryShareDialog
      slug="m10"
      bookingAdvanceDays={bookingAdvanceDays}
      trackAction={trackAction}
      onClose={onClose}
    />,
  )
}

// Bajo `singleThread` (vitest.config.ts) todos los archivos comparten worker: lo
// que este test pisa sin devolver (`window.matchMedia`, `navigator.*`, `URL.*`,
// un spy de `HTMLAnchorElement.click`) le llega al archivo que corra después.
const originalMatchMedia = window.matchMedia
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const navigatorBackup = new Map<string, PropertyDescriptor | undefined>()

function setNavigator(props: Record<string, unknown>) {
  for (const [name, value] of Object.entries(props)) {
    if (!navigatorBackup.has(name)) {
      navigatorBackup.set(name, Object.getOwnPropertyDescriptor(navigator, name))
    }
    Object.defineProperty(navigator, name, { value, configurable: true })
  }
}

function restoreNavigator() {
  for (const [name, descriptor] of navigatorBackup) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor)
    else Reflect.deleteProperty(navigator, name)
  }
  navigatorBackup.clear()
}

function setCoarsePointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async () => pngResponse())
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:placa')
  URL.revokeObjectURL = vi.fn()
  trackAction.mockResolvedValue({ success: true })
  setCoarsePointer(false)
  setNavigator({ share: undefined, canShare: undefined, clipboard: undefined })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.matchMedia = originalMatchMedia
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  restoreNavigator()
})

describe('StoryShareDialog', () => {
  it('pide la placa de hoy y muestra la vista previa', async () => {
    renderDialog()
    expect(screen.getByText('Armando la placa…')).toBeTruthy()

    const img = await screen.findByRole('img', { name: /placa de turnos libres/i })
    expect(img.getAttribute('src')).toBe('blob:placa')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/public/story?slug=m10&date=2026-09-29')
  })

  it('ofrece hoy y los próximos días de reserva (hasta una semana) y pide otro día al tocarlo', async () => {
    renderDialog(20)
    await screen.findByRole('img')
    expect(screen.getAllByRole('radio')).toHaveLength(7)

    fireEvent.click(screen.getByRole('radio', { name: 'Mañana' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/public/story?slug=m10&date=2026-09-30',
        expect.anything(),
      ),
    )
  })

  it('al cambiar de día no muestra la placa del anterior aunque su respuesta llegue tarde', async () => {
    const pending: Array<(res: Response) => void> = []
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
    let created = 0
    URL.createObjectURL = vi.fn(() => `blob:placa-${++created}`)
    renderDialog()
    await waitFor(() => expect(pending).toHaveLength(1))

    fireEvent.click(screen.getByRole('radio', { name: 'Mañana' }))
    await waitFor(() => expect(pending).toHaveLength(2))

    // La respuesta de HOY llega cuando el dueño ya está mirando MAÑANA.
    await act(async () => {
      pending[0](pngResponse())
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Armando la placa…')).toBeTruthy()
    expect(URL.createObjectURL).not.toHaveBeenCalled()

    await act(async () => {
      pending[1](pngResponse())
    })
    const img = await screen.findByRole('img')
    expect(img.getAttribute('src')).toBe('blob:placa-1')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('sin días de anticipación no dibuja el selector', async () => {
    renderDialog(0)
    await screen.findByRole('img')
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('un 409 muestra el mensaje del servidor, sin reintentar y sin poder descargar', async () => {
    fetchMock.mockImplementation(async () =>
      errorResponse(409, 'No quedan turnos libres ese día. Elegí otro día.'),
    )
    renderDialog()

    expect(await screen.findByText('No quedan turnos libres ese día. Elegí otro día.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(screen.getByRole('button', { name: /Descargar imagen/ }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('un 500 ofrece reintentar y vuelve a pedir la placa', async () => {
    fetchMock.mockImplementationOnce(async () =>
      errorResponse(500, 'No se pudo generar la imagen.'),
    )
    renderDialog()

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('img')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('un 429 explica que hay que esperar', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 429 }))
    renderDialog()
    expect(await screen.findByText(/Pediste muchas placas seguidas/)).toBeTruthy()
  })

  it('sin conexión ofrece reintentar', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch')
    })
    renderDialog()
    expect(await screen.findByText(/No hay conexión/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })

  describe('en escritorio', () => {
    it('descarga la imagen y lo mide una sola vez', async () => {
      const downloads: string[] = []
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push(`${this.download}|${this.href}`)
      })
      setNavigator({ share: vi.fn(), canShare: () => true })
      renderDialog()
      await screen.findByRole('img')

      // Aunque el navegador sepa compartir archivos, en escritorio el primario descarga.
      expect(screen.queryByRole('button', { name: /Compartir imagen/ })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Descargar imagen/ }))

      expect(downloads).toEqual(['turnos-m10-2026-09-29.png|blob:placa'])
      expect(trackAction).toHaveBeenCalledTimes(1)
      expect(trackAction).toHaveBeenCalledWith({ method: 'download', daysAhead: 0 })
    })
  })

  describe('en el celular', () => {
    const share = vi.fn()

    beforeEach(() => {
      setCoarsePointer(true)
      share.mockReset()
      setNavigator({ share, canShare: () => true })
    })

    it('comparte el archivo PNG y lo mide', async () => {
      share.mockResolvedValue(undefined)
      renderDialog()
      await screen.findByRole('img')

      fireEvent.click(screen.getByRole('button', { name: /Compartir imagen/ }))
      await waitFor(() => expect(trackAction).toHaveBeenCalledTimes(1))

      const arg = share.mock.calls[0][0] as { files: File[] }
      expect(arg.files).toHaveLength(1)
      expect(arg.files[0].name).toBe('turnos-m10-2026-09-29.png')
      expect(arg.files[0].type).toBe('image/png')
      expect(trackAction).toHaveBeenCalledWith({ method: 'share', daysAhead: 0 })
    })

    it('si cierra el menú de compartir no es un error ni se mide', async () => {
      share.mockRejectedValue(new DOMException('cancelado', 'AbortError'))
      renderDialog()
      await screen.findByRole('img')

      fireEvent.click(screen.getByRole('button', { name: /Compartir imagen/ }))
      await waitFor(() => expect(share).toHaveBeenCalled())
      await Promise.resolve()

      expect(screen.queryByRole('alert')).toBeNull()
      expect(trackAction).not.toHaveBeenCalled()
    })

    it('si el sistema falla al compartir manda a descargar', async () => {
      share.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
      renderDialog()
      await screen.findByRole('img')

      fireEvent.click(screen.getByRole('button', { name: /Compartir imagen/ }))
      expect((await screen.findByRole('alert')).textContent).toMatch(/Descargá la imagen/)
      expect(trackAction).not.toHaveBeenCalled()
    })

    it('si el navegador no puede compartir archivos ofrece descargar', async () => {
      setNavigator({ share, canShare: () => false })
      renderDialog()
      await screen.findByRole('img')
      expect(screen.queryByRole('button', { name: /Compartir imagen/ })).toBeNull()
      expect(screen.getByRole('button', { name: /Descargar imagen/ })).toBeTruthy()
    })
  })

  describe('el link como texto', () => {
    it('lo copia al portapapeles, aunque la imagen no se haya podido generar, y lo mide', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      setNavigator({ clipboard: { writeText } })
      fetchMock.mockImplementation(async () => errorResponse(409, 'No quedan turnos libres.'))
      renderDialog()
      await screen.findByText('No quedan turnos libres.')

      fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }))

      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
      expect(writeText.mock.calls[0][0]).toMatch(/^https?:\/\/.+\/m10$/)
      expect(await screen.findByText('¡Copiado!')).toBeTruthy()
      expect(trackAction).toHaveBeenCalledWith({ method: 'link', daysAhead: 0 })
    })

    it('si el portapapeles no está, muestra el link para copiarlo a mano', async () => {
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
      renderDialog()
      await screen.findByRole('img')

      fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }))

      await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
      expect(prompt.mock.calls[0][1]).toMatch(/\/m10$/)
    })
  })

  it('no bloquea al dueño si la medición falla', async () => {
    trackAction.mockRejectedValue(new Error('red'))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderDialog()
    await screen.findByRole('img')

    fireEvent.click(screen.getByRole('button', { name: /Descargar imagen/ }))
    await waitFor(() => expect(trackAction).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('libera la URL de la vista previa al cerrar', async () => {
    const { unmount } = renderDialog()
    await screen.findByRole('img')
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:placa')
  })
})
