import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInboundAudio } from '@/lib/kapso/media'

const fetchMock = vi.fn<typeof fetch>()
const MAX = 1024 * 1024

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const audioMessage = (over: Record<string, unknown> = {}) => ({
  data: {
    id: 'wamid.1',
    type: 'audio',
    audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus', voice: true },
    kapso: { direction: 'inbound', has_media: true },
    ...over,
  },
})

const params = { waMessageId: 'wamid.1', phoneNumberId: 'pn-1', maxBytes: MAX }

beforeEach(() => {
  vi.stubEnv('KAPSO_API_KEY', 'k-test')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('fetchInboundAudio (Kapso)', () => {
  it('pide el mensaje, el link del archivo y lo baja sin mandar la clave al link', async () => {
    fetchMock
      .mockResolvedValueOnce(json(audioMessage()))
      .mockResolvedValueOnce(
        json({
          id: 'media-1',
          mime_type: 'audio/ogg; codecs=opus',
          file_size: '3',
          download_url: 'https://api.kapso.ai/meta/whatsapp/media_download?token=t',
        }),
      )
      .mockResolvedValueOnce(new Response(new Blob(['ogg'])))

    const result = await fetchInboundAudio(params)

    expect(result.kind).toBe('file')
    if (result.kind !== 'file') return
    expect(result.filename).toBe('audio.ogg')
    expect(result.audio.type).toBe('audio/ogg')
    expect(result.audio.size).toBe(3)

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toBe('https://api.kapso.ai/platform/v1/whatsapp/messages/wamid.1')
    expect(urls[1]).toBe('https://api.kapso.ai/meta/whatsapp/v24.0/media-1?phone_number_id=pn-1')
    expect(urls[2]).toBe('https://api.kapso.ai/meta/whatsapp/media_download?token=t')
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>)['X-API-Key']).toBe(
      'k-test',
    )
    expect(fetchMock.mock.calls[2]![1]?.headers).toBeUndefined()
  })

  it('si Kapso ya lo transcribió, devuelve ese texto sin bajar nada', async () => {
    fetchMock.mockResolvedValueOnce(
      json(audioMessage({ kapso: { transcript: { text: ' quiero reservar ' } } })),
    )
    expect(await fetchInboundAudio(params)).toEqual({ kind: 'transcript', text: 'quiero reservar' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un archivo más grande que el tope no se baja', async () => {
    fetchMock
      .mockResolvedValueOnce(json(audioMessage()))
      .mockResolvedValueOnce(
        json({ download_url: 'https://api.kapso.ai/x', file_size: String(MAX + 1) }),
      )
    expect(await fetchInboundAudio(params)).toEqual({ kind: 'none' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sin file_size, corta por el Content-Length antes de leer el archivo', async () => {
    const big = new Response('x', { headers: { 'Content-Length': String(MAX + 1) } })
    const blobSpy = vi.spyOn(big, 'blob')
    fetchMock
      .mockResolvedValueOnce(json(audioMessage()))
      .mockResolvedValueOnce(json({ download_url: 'https://api.kapso.ai/x' }))
      .mockResolvedValueOnce(big)
    expect(await fetchInboundAudio(params)).toEqual({ kind: 'none' })
    expect(blobSpy).not.toHaveBeenCalled()
  })

  it('un file_size ilegible se trata como demasiado grande', async () => {
    fetchMock
      .mockResolvedValueOnce(json(audioMessage()))
      .mockResolvedValueOnce(json({ download_url: 'https://api.kapso.ai/x', file_size: 'abc' }))
    expect(await fetchInboundAudio(params)).toEqual({ kind: 'none' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('una descarga vacía devuelve none', async () => {
    fetchMock
      .mockResolvedValueOnce(json(audioMessage()))
      .mockResolvedValueOnce(json({ download_url: 'https://api.kapso.ai/x', file_size: '0' }))
      .mockResolvedValueOnce(new Response(new Blob([])))
    expect(await fetchInboundAudio(params)).toEqual({ kind: 'none' })
  })

  it('un mensaje que no es audio devuelve none', async () => {
    fetchMock.mockResolvedValueOnce(json(audioMessage({ type: 'text', audio: undefined })))
    expect(await fetchInboundAudio(params)).toEqual({ kind: 'none' })
  })

  it('un error de Kapso tira con el status', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404))
    await expect(fetchInboundAudio(params)).rejects.toThrow(/Kapso respondió 404/)
  })
})
