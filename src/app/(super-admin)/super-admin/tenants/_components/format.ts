/**
 * Formateo de fechas para el panel SuperAdmin. Los timestamps viven en UTC en
 * la DB; acá se convierten a ART solo para mostrar (regla CLAUDE.md).
 */

const ART = 'America/Argentina/Buenos_Aires'

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: ART,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: ART,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateArt(value: Date | null | undefined): string {
  if (!value) return '—'
  return dateFmt.format(value)
}

export function formatDateTimeArt(value: Date | null | undefined): string {
  if (!value) return '—'
  return dateTimeFmt.format(value)
}
