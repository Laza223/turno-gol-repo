// Tabla del quiz "¿De qué categoría sos?" (docs/rival/landing.md, sección 2). Es una propuesta
// pendiente del OK del founder; el techo en Quinta sí está decidido: nadie arranca más arriba.

export const CATEGORY_LADDER = [
  'Novena',
  'Octava',
  'Séptima',
  'Sexta',
  'Quinta',
  'Cuarta',
  'Reserva',
  'Primera',
  'Selección',
] as const

export type Category = (typeof CATEGORY_LADDER)[number]

/** Techo del arranque. */
export const STARTING_CEILING: Category = 'Quinta'

export const QUIZ_FREQUENCIES = ['1 vez por semana', '2 o 3', '4 o más'] as const
export const QUIZ_BACKGROUNDS = [
  'Picados',
  'Liga amateur',
  'Inferiores de un club',
  'Federado',
] as const
export const QUIZ_POSITIONS = ['Arquero', 'Defensor', 'Mediocampista', 'Delantero'] as const

// Filas: ¿Dónde jugaste?; columnas: ¿Cuánto jugás?
const START_TABLE: readonly (readonly Category[])[] = [
  ['Novena', 'Octava', 'Séptima'],
  ['Octava', 'Séptima', 'Sexta'],
  ['Séptima', 'Sexta', 'Quinta'],
  ['Sexta', 'Quinta', 'Quinta'],
]

/** Categoría de arranque. El puesto no cambia la categoría: queda para la figurita. */
export function startingCategory(background: number, frequency: number): Category {
  const row = START_TABLE[background]
  const cat = row?.[frequency]
  if (!cat) throw new RangeError(`Respuesta fuera de rango: ${background}, ${frequency}`)
  return cat
}
