import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '../..')

/** Camina `src/` y devuelve los `.stories.tsx`, en paths relativos con `/`. */
function findStories(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) findStories(full, out)
    else if (entry.name.endsWith('.stories.tsx')) {
      out.push(relative(ROOT, full).split(sep).join('/'))
    }
  }
  return out
}

/**
 * Candado de la clase de bug que colgó `Stories (BLOCKING)` en CI (ver ci.yml,
 * job `stories-shards`): 6 archivos pedían tiles de OpenStreetMap o una foto de
 * Unsplash/un CDN propio de verdad — tráfico saliente real desde el runner,
 * sujeto a la latencia y al rate limiter de un tercero. Una suite cuyo tiempo
 * depende de eso es no-determinística por construcción.
 *
 * Para agregar una excepción hay que escribir el motivo acá — igual que
 * `stories-no-dangling-promise.test.ts`. Si el motivo es "la URL nunca se
 * fetchea de verdad" (namespace de XML, string dentro de un mock nunca
 * invocado, href de un link que la propia story deja inerte), es una excepción
 * válida. Si la URL SÍ termina en un `<img src>` o un `fetch` real, no lo es:
 * hay que reemplazarla por un `data:` URI.
 */
const ALLOWLIST: Record<string, string> = {
  'src/components/ui/image-uploader.stories.tsx':
    'http://www.w3.org/2000/svg es el namespace del <svg> del placeholder, no una URL ' +
    'que se fetchea.',
  'src/app/onboarding/components/StepCourts.stories.tsx':
    'https://example.com/foto.webp es el valor de retorno de un `uploadPhotoAction` ' +
    'mockeado que ninguna story de este archivo dispara (sin `userEvent.upload`) — ' +
    'nunca se renderiza.',
  'src/components/admin/PushNotificationManager.stories.tsx':
    'https://fcm.googleapis.com/fake/abc123 es un string fijo dentro del `pushManager.' +
    'getSubscription()` stubeado (stubPushApis) — vive en memoria, no se fetchea.',
  'src/app/onboarding/listo/ShareActions.stories.tsx':
    'El link de wa.me se deja INERTE a propósito (comentario en el archivo): la story ' +
    'solo lee el atributo href, nunca lo clickea.',
  'src/components/booking/BookingSuccessExtras.stories.tsx':
    '`CompartirPorWhatsApp` intercepta `window.open` con spyOn+mockImplementation antes ' +
    'de clickear — nunca navega de verdad; `ComoLlegar` solo lee el atributo href de ' +
    'Google Maps sin clickear.',
  'src/app/reserva/[bookingId]/exito/BookingSuccessCard.stories.tsx':
    'verifyUrl llega a BookingQR, que genera el SVG local con `uqr` (sin canvas ni red).',
  'src/components/booking/BookingQR.stories.tsx':
    'value llega a `uqr`, que genera el SVG local — sin canvas ni red (ver BookingQR.tsx).',
  'src/components/booking/BookingReceipt.stories.tsx':
    'verifyUrl llega a BookingQR (SVG local, `uqr`) y a un <span> de texto plano — nunca ' +
    'se fetchea.',
  'src/components/dashboard/onboarding-checklist.stories.tsx':
    'appUrl solo alimenta `navigator.clipboard.writeText()` — nunca se fetchea ni se ' +
    'renderiza como recurso.',
  'src/components/public/ShareButton.stories.tsx':
    'url solo alimenta `navigator.clipboard.writeText()` (ShareButton.tsx) — nunca se ' +
    'fetchea ni se renderiza como recurso.',
}

/** http(s) fuera de `data:`/`blob:` y de localhost/127.0.0.1. */
const LIVE_URL = /https?:\/\/(?!(?:localhost|127\.0\.0\.1)(?::\d+)?\/)[^\s'"`)]+/g

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('stories: ninguna URL de red real fuera de la allowlist', () => {
  const files = findStories(resolve(ROOT, 'src')).sort()

  it('encuentra archivos de stories (el glob no quedó vacío)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  for (const rel of files) {
    const norm = rel.replace(/\\/g, '/')
    const motivo = ALLOWLIST[norm]

    it(`${norm}${motivo ? ' (allowlist)' : ''}`, () => {
      const src = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'))
      const matches = src.match(LIVE_URL) ?? []

      if (motivo) {
        // La allowlist no es un cajón: si el archivo ya no tiene ninguna URL
        // viva, la entrada sobra y hay que sacarla.
        expect(matches.length, `${norm} está en la allowlist pero ya no tiene URLs http(s)`).toBeGreaterThan(0)
        return
      }

      expect(
        matches,
        `${norm} tiene una URL http(s) real: ${matches.join(', ')}. Si un componente la ` +
          'renderiza en un <img src> o la fetchea, usá un data: URI. Si nunca se ejecuta ' +
          'de verdad, agregá el archivo a ALLOWLIST con el motivo escrito.',
      ).toEqual([])
    })
  }
})
