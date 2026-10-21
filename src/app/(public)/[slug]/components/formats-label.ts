/** [5, 7] → "Fútbol 5 y 7" · [5, 7, 11] → "Fútbol 5, 7 y 11". */
export function formatsLabel(formats: number[]): string | null {
  const f = [...new Set(formats)].sort((a, b) => a - b)
  if (f.length === 0) return null
  if (f.length === 1) return `Fútbol ${f[0]}`
  return `Fútbol ${f.slice(0, -1).join(', ')} y ${f[f.length - 1]}`
}
