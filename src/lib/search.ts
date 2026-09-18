/**
 * Normalización para buscar texto escrito a mano: sin acentos, sin mayúsculas
 * y sin espacios al borde.
 *
 * Vivía adentro de `ui/combobox.tsx` y solo la usaba el combobox. Sale acá
 * porque los buscadores de lista (cantina, deudas) filtraban con
 * `toLowerCase().includes(...)` a mano, y eso falla con lo que este repo ve
 * todos los días: "Martin" no encuentra a "Martín".
 */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
