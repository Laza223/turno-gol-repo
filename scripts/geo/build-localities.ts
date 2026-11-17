/**
 * Genera `src/modules/geo/data/localities.json` desde Georef (API oficial del Estado).
 *
 * Uso: pnpm exec tsx scripts/geo/build-localities.ts
 *
 * Une `localidades-censales` (su id sirve de filtro `localidad_censal` en Georef
 * direcciones) con `localidades`, deduplica por (nombre, provincia, departamento)
 * prefiriendo la censal y NO usa `asentamientos` (barrios y parajes ruidosos).
 *
 * Formato: { provinces: string[], rows: [city, provinceIdx, department, lat, lng, censalId|null, departmentId][] }
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { cleanPlaceName, comparable, normalizeProvince } from '../../src/modules/geo/normalize'
import { PROVINCES } from '../../src/shared/geo/argentina'

const BASE = 'https://apis.datos.gob.ar/georef/api'
const FIELDS = 'id,nombre,provincia.nombre,departamento.nombre,municipio.nombre,centroide'
const OUT = path.resolve(__dirname, '../../src/modules/geo/data/localities.json')

type Raw = {
  id?: string
  nombre?: string
  provincia?: { nombre?: string }
  departamento?: { nombre?: string }
  municipio?: { nombre?: string }
  centroide?: { lat?: number; lon?: number }
}
type Row = [string, number, string, number, number, string | null, string]

async function fetchAll(endpoint: 'localidades-censales' | 'localidades'): Promise<Raw[]> {
  const res = await fetch(`${BASE}/${endpoint}?max=5000&campos=${FIELDS}`)
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`)
  const json = (await res.json()) as Record<string, unknown>
  const list = json[endpoint.replace('-', '_')]
  if (!Array.isArray(list)) throw new Error(`${endpoint}: respuesta sin lista`)
  console.log(`${endpoint}: ${list.length} de ${String(json.total)}`)
  return list as Raw[]
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

function toRow(raw: Raw, censal: boolean): Row | null {
  const c = raw.centroide
  if (!raw.nombre || !raw.provincia?.nombre || !raw.id) return null
  if (typeof c?.lat !== 'number' || typeof c.lon !== 'number') return null
  const province = normalizeProvince(raw.provincia.nombre)
  const provIdx = (PROVINCES as readonly string[]).indexOf(province)
  if (provIdx < 0) return null
  const department = cleanPlaceName(raw.departamento?.nombre ?? raw.municipio?.nombre ?? '')
  // Georef a veces pierde la tilde en el nombre y la conserva en el departamento
  // ("General Rodriguez" / "General Rodríguez"): gana la grafía con tilde.
  const name = cleanPlaceName(raw.nombre)
  return [
    department && comparable(department) === comparable(name) ? department : name,
    provIdx,
    department,
    round5(c.lat),
    round5(c.lon),
    censal ? raw.id : null,
    raw.id.slice(0, 5),
  ]
}

async function main() {
  const censales = (await fetchAll('localidades-censales')).map((r) => toRow(r, true))
  const planas = (await fetchAll('localidades')).map((r) => toRow(r, false))
  const byKey = new Map<string, Row>()
  for (const row of [...censales, ...planas]) {
    if (!row) continue
    const key = `${comparable(row[0])}|${row[1]}|${comparable(row[2])}`
    if (!byKey.has(key)) byKey.set(key, row) // censales primero: gana la censal
  }
  const rows = [...byKey.values()].sort(
    (a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'es') || a[2].localeCompare(b[2], 'es'),
  )
  writeFileSync(OUT, JSON.stringify({ provinces: PROVINCES, rows }))
  console.log(`OK: ${rows.length} filas -> ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
