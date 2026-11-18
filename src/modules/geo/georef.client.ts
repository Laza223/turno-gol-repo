import { z } from 'zod'
import { fetchWithTimeout } from '@/shared/utils/async'
import { captureException } from '@/lib/sentry'
import { cleanPlaceName, dedupeByLabel, normalizeProvince, toTitleCase } from './normalize'
import type { GeoAddress } from './geo.types'

// Georef: API oficial de direcciones del Estado argentino (gratis, sin key).
// Filtros válidos de /direcciones: `localidad_censal` (id o nombre), `departamento` y
// `provincia`. NO existe `localidad`: Georef lo ignora en silencio (bug del buscador viejo).
const GEOREF_URL = 'https://apis.datos.gob.ar/georef/api'
const TIMEOUT_MS = 5000
const MAX_RESULTS = 5

export type GeorefResult<T> = { ok: true; data: T } | { ok: false }

const nameSchema = z.object({ nombre: z.string().nullish() }).partial().nullish()

const addressSchema = z.object({
  calle: nameSchema,
  altura: z
    .object({ valor: z.union([z.number(), z.string()]).nullish() })
    .partial()
    .nullish(),
  localidad_censal: nameSchema,
  departamento: nameSchema,
  provincia: nameSchema,
  ubicacion: z.object({ lat: z.number(), lon: z.number() }).partial().nullish(),
})

const listSchema = z.object({ direcciones: z.array(z.unknown()).optional() })

/** Parser puro (testeable sin red). Nunca tira: lo que no alcanza a armar una dirección se descarta. */
export function parseGeorefAddresses(json: unknown): GeoAddress[] {
  const list = listSchema.safeParse(json)
  if (!list.success) return []
  const out: GeoAddress[] = []
  for (const raw of list.data.direcciones ?? []) {
    const r = addressSchema.safeParse(raw)
    if (!r.success) continue
    const { lat, lon } = r.data.ubicacion ?? {}
    const street = r.data.calle?.nombre
    const provinceRaw = r.data.provincia?.nombre
    const city = cleanPlaceName(
      r.data.localidad_censal?.nombre ?? r.data.departamento?.nombre ?? '',
    )
    if (typeof lat !== 'number' || typeof lon !== 'number' || !street || !provinceRaw || !city) {
      continue
    }
    const height = r.data.altura?.valor
    const address = [toTitleCase(street), height ? String(height) : ''].filter(Boolean).join(' ')
    const province = normalizeProvince(provinceRaw)
    out.push({
      label: `${address}, ${city}, ${province}`,
      address,
      city,
      province,
      lat,
      lng: lon,
      source: 'georef',
    })
  }
  return dedupeByLabel(out).slice(0, MAX_RESULTS)
}

export type GeorefAddressInput = {
  street: string
  localityId?: string
  city?: string
  province?: string
  department?: string
}

/** URLs candidatas, en orden: primero por localidad censal, después por departamento. */
export function buildGeorefAddressUrls(input: GeorefAddressInput): string[] {
  const make = (filter: Record<string, string>) => {
    const params = new URLSearchParams({ direccion: input.street, max: String(MAX_RESULTS) })
    for (const [k, v] of Object.entries(filter)) params.set(k, v)
    if (input.province) params.set('provincia', input.province)
    return `${GEOREF_URL}/direcciones?${params.toString()}`
  }
  if (input.localityId) return [make({ localidad_censal: input.localityId })]
  const place = input.city ?? input.department
  if (!place) return [make({})]
  return [make({ localidad_censal: place }), make({ departamento: input.department ?? place })]
}

async function getJson(url: string): Promise<GeorefResult<unknown>> {
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS)
    if (!res.ok) {
      // Sin la URL: lleva lo que escribió el usuario o sus coordenadas.
      captureException(new Error(`Georef respondió ${res.status}`))
      return { ok: false }
    }
    return { ok: true, data: await res.json() }
  } catch (err) {
    captureException(new Error(err instanceof Error ? `Georef: ${err.name}` : 'Georef falló'))
    return { ok: false }
  }
}

/** Busca direcciones. Nunca tira: `ok:false` = el servicio falló (distinto de 0 resultados). */
export async function searchGeorefAddresses(
  input: GeorefAddressInput,
): Promise<GeorefResult<GeoAddress[]>> {
  let failed = false
  for (const url of buildGeorefAddressUrls(input)) {
    const res = await getJson(url)
    if (!res.ok) {
      failed = true
      continue
    }
    const parsed = parseGeorefAddresses(res.data)
    if (parsed.length > 0) return { ok: true, data: parsed }
  }
  return failed ? { ok: false } : { ok: true, data: [] }
}

export type GeorefLocation = {
  province: string
  department?: string
  departmentId?: string
  municipality?: string
}

const locationSchema = z.object({
  ubicacion: z.object({
    provincia: nameSchema,
    departamento: z
      .object({ id: z.string().nullish(), nombre: z.string().nullish() })
      .partial()
      .nullish(),
    municipio: nameSchema,
  }),
})

/** Parser puro de `/ubicacion`; `null` si el punto no cae en una provincia argentina. */
export function parseGeorefLocation(json: unknown): GeorefLocation | null {
  const r = locationSchema.safeParse(json)
  if (!r.success) return null
  const { provincia, departamento, municipio } = r.data.ubicacion
  if (!provincia?.nombre) return null
  return {
    province: normalizeProvince(provincia.nombre),
    ...(departamento?.nombre ? { department: cleanPlaceName(departamento.nombre) } : {}),
    ...(departamento?.id ? { departmentId: departamento.id } : {}),
    ...(municipio?.nombre ? { municipality: cleanPlaceName(municipio.nombre) } : {}),
  }
}

/** Provincia, departamento y municipio de un punto. `data: null` = el punto no está en una provincia. */
export async function reverseGeorefLocation(
  lat: number,
  lng: number,
): Promise<GeorefResult<GeorefLocation | null>> {
  const url = `${GEOREF_URL}/ubicacion?${new URLSearchParams({ lat: String(lat), lon: String(lng) })}`
  const res = await getJson(url)
  return res.ok ? { ok: true, data: parseGeorefLocation(res.data) } : { ok: false }
}
