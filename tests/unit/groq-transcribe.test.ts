import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isGroqConfigured, transcribeAudio } from '@/lib/groq/transcribe'

const fetchMock = vi.fn<typeof fetch>()
const audio = () => new Blob(['ogg'], { type: 'audio/ogg' })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', 'gsk-test')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('transcribeAudio (Groq)', () => {
  it('manda el audio con whisper turbo en español y devuelve el texto', async () => {
    fetchMock.mockResolvedValueOnce(json({ text: '  tenés turno a las 21?  ' }))

    expect(await transcribeAudio(audio(), { filename: 'audio.ogg' })).toBe('tenés turno a las 21?')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer gsk-test')
    const form = init?.body as FormData
    expect(form.get('model')).toBe('whisper-large-v3-turbo')
    expect(form.get('language')).toBe('es')
    expect(form.get('response_format')).toBe('verbose_json')
    expect((form.get('file') as File).name).toBe('audio.ogg')
  })

  it('un audio sin palabras devuelve null, no un texto vacío', async () => {
    fetchMock.mockResolvedValueOnce(json({ text: '   ' }))
    expect(await transcribeAudio(audio(), { filename: 'audio.ogg' })).toBeNull()
  })

  it('descarta lo que Whisper inventa sobre silencio o ruido', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        text: ' Gracias por ver el video.',
        segments: [{ text: ' Gracias por ver el video.', no_speech_prob: 0.92, avg_logprob: -1.4 }],
      }),
    )
    expect(await transcribeAudio(audio(), { filename: 'audio.ogg' })).toBeNull()
  })

  it('de un audio con voz y un tramo de ruido, se queda solo con la voz', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        text: ' hay turno a las 21? Subtítulos realizados por la comunidad',
        segments: [
          { text: ' hay turno a las 21?', no_speech_prob: 0.02, avg_logprob: -0.2 },
          {
            text: ' Subtítulos realizados por la comunidad',
            no_speech_prob: 0.8,
            avg_logprob: -1.6,
          },
        ],
      }),
    )
    expect(await transcribeAudio(audio(), { filename: 'audio.ogg' })).toBe('hay turno a las 21?')
  })

  it('un tramo con probabilidad de silencio alta pero confianza buena se conserva', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        text: ' sí',
        segments: [{ text: ' sí', no_speech_prob: 0.7, avg_logprob: -0.3 }],
      }),
    )
    expect(await transcribeAudio(audio(), { filename: 'audio.ogg' })).toBe('sí')
  })

  it('un error de Groq (cuota) tira con el status', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'rate limit' } }, 429))
    await expect(transcribeAudio(audio(), { filename: 'audio.ogg' })).rejects.toThrow(
      /Groq respondió 429/,
    )
  })

  it('sin clave no llama a nadie', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    expect(isGroqConfigured()).toBe(false)
    await expect(transcribeAudio(audio(), { filename: 'audio.ogg' })).rejects.toThrow(
      /GROQ_API_KEY/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
