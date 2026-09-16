import { z } from 'zod'
import { fetchWithTimeout } from '@/shared/utils/async'
import { captureException } from '@/lib/sentry'

/**
 * Buscador de dirección server-side contra Georef, la API oficial de
 * direcciones del Estado argentino: gratis, sin API key, con altura de calle.
 *
 * Reemplaza el "marcá el punto a mano" como ÚNICO camino (el mapa seguía sin
 * geocodificador, doc10 §82) — el pin arrastrable sigue existiendo, esto sólo
 * evita arrancar con un zoom de toda la provincia. Se muestran CANDIDATOS para
 * elegir, nunca se autocompleta a ciegas: Georef puede devolver otra
 * localidad ("San Martin 850" con localidad "Lujan" devolvió Tigre).
 */
export type GeocodeCandidate = { label: string; lat: number; lng: number }

const GEOREF_URL = 'https://apis.datos.gob.ar/georef/api/direcciones'
const TIMEOUT_MS = 5000
const MAX_RESULTS = 5

/**
 * Forma mínima esperada de la respuesta. Deliberadamente laxa: es la respuesta
 * de un tercero, y un campo extra o ausente no debe tirar el parseo entero
 * abajo — sólo el resultado puntual que no alcanza a armar un candidato.
 */
const georefResultSchema = z.object({
  nomenclatura: z.string(),
  ubicacion: z.object({ lat: z.number(), lon: z.number() }).partial().optional(),
})

const georefResponseSchema = z.object({
  cantidad: z.number().optional(),
  results: z.array(z.unknown()).optional(),
})

/**
 * Parser puro: testeable sin red. Nunca tira — cualquier forma inesperada
 * (JSON basura, resultado sin `ubicacion`, campos no numéricos) se traduce en
 * "descartar ese candidato", no en una excepción. `cantidad: 0` es un
 * resultado normal (la dirección no existe) y da `[]` igual que un JSON roto.
 */
export function parseGeorefResponse(json: unknown): GeocodeCandidate[] {
  const parsed = georefResponseSchema.safeParse(json)
  if (!parsed.success) return []

  const candidates: GeocodeCandidate[] = []
  for (const raw of parsed.data.results ?? []) {
    const result = georefResultSchema.safeParse(raw)
    if (!result.success) continue
    const { lat, lon } = result.data.ubicacion ?? {}
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    candidates.push({ label: result.data.nomenclatura, lat, lng: lon })
  }
  return candidates.slice(0, MAX_RESULTS)
}

function buildSearchUrl(input: { address: string; city?: string; province?: string }): string {
  const params = new URLSearchParams({ direccion: input.address, max: String(MAX_RESULTS) })
  if (input.city) params.set('localidad', input.city)
  if (input.province) params.set('provincia', input.province)
  return `${GEOREF_URL}?${params.toString()}`
}

/**
 * Busca candidatos de dirección. Nunca tira: ante error de red, timeout,
 * status distinto de 200 o un cuerpo que ni siquiera es un objeto JSON,
 * reporta a Sentry y devuelve `[]` — la UI lo trata igual que "sin
 * resultados" y el dueño siempre puede marcar el punto a mano.
 */
export async function searchAddress(input: {
  address: string
  city?: string
  province?: string
}): Promise<GeocodeCandidate[]> {
  let response: Response
  try {
    response = await fetchWithTimeout(buildSearchUrl(input), {}, TIMEOUT_MS)
  } catch (err) {
    captureException(err)
    return []
  }

  if (!response.ok) {
    captureException(new Error(`Georef respondió ${response.status}`))
    return []
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (err) {
    captureException(err)
    return []
  }

  if (typeof json !== 'object' || json === null) {
    captureException(new Error('Georef devolvió un formato inesperado'))
    return []
  }

  return parseGeorefResponse(json)
}
