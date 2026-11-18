import { normalizeForSearch } from '@/lib/search'
import { PROVINCES } from '@/shared/geo/argentina'

// Invisibles que Georef y OSM cuelan en los nombres: guion blando (U+00AD),
// anchos cero, marcas direccionales y BOM.
const INVISIBLES = /[­​-‏‪-‮⁠-⁤﻿]/g

/** Nombre de lugar limpio: sin invisibles, NFC, espacios colapsados. */
export function cleanPlaceName(name: string): string {
  return name.replace(INVISIBLES, '').normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Clave para comparar nombres: sin tildes, minúsculas, espacios colapsados. */
export function comparable(name: string): string {
  return normalizeForSearch(cleanPlaceName(name)).replace(/\s+/g, ' ')
}

/** Nombre de provincia de Georef/OSM → el de `PROVINCES`. Si no se reconoce, queda el original limpio. */
export function normalizeProvince(name: string): string {
  const clean = cleanPlaceName(name)
  const n = comparable(clean)
  if (n.startsWith('ciudad autonoma') || n === 'caba' || n === 'capital federal') return 'CABA'
  if (n.startsWith('tierra del fuego')) return 'Tierra del Fuego'
  return PROVINCES.find((p) => n.startsWith(comparable(p))) ?? clean
}

/** Title Case para calles que Georef responde en mayúsculas ("BARTOLOME MITRE"). */
export function toTitleCase(s: string): string {
  return cleanPlaceName(s)
    .toLowerCase()
    .replace(/(^|[\s.-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|El)\b(?!$)/g, (w, _a, off: number) =>
      off === 0 ? w : w.toLowerCase(),
    )
}

/**
 * Las fuentes repiten la misma dirección con puntos distintos (Georef trae una fila por tramo de
 * calle): en la lista se muestra una sola vez, que además es la `key` de cada fila.
 */
export function dedupeByLabel<T extends { label: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter((item) => {
    if (seen.has(item.label)) return false
    seen.add(item.label)
    return true
  })
}
