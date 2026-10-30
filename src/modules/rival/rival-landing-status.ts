// Mapa de estados de la landing de RIVAL (docs/rival/landing.md, "Qué está construido y qué es
// Próximamente"). Es la única fuente: la página lee de acá el chip y el texto de cada pieza, así
// que cuando sale una ola se cambia UNA línea y la landing sigue diciendo la verdad.
// 'available' solo lo que existe en v1 (spec 2026-10-22). Todo lo demás es 'soon'.

type LandingStatus = 'available' | 'soon'

export const RIVAL_LANDING_STATUS = {
  // v1: construido
  groupMatch: 'available', // armar el partido del grupo, link por WhatsApp, "Voy", "Faltan N"
  voy: 'available', // "Voy" → "Estoy adentro"
  bench: 'available', // banco con promoción automática y "Me bajo" sin penalidad
  cupo: 'available', // cupo duro
  fijo: 'available', // "Repetir el partido"
  reservedSeal: 'available', // sello "Reservada en TurnoGol"
  level: 'available', // Tranqui, Parejo o Picante
  board: 'available', // el tablón y el contacto por WhatsApp al aceptar
  mailAlerts: 'available', // aviso por mail cuando buscan gente en tu complejo (opt-in)
  // Próximamente
  playedMatchesCount: 'soon', // que los partidos de RIVAL sumen a tus partidos jugados
  formation: 'soon',
  panYQueso: 'soon',
  category: 'soon',
  club: 'soon',
  officialMatch: 'soon',
  figure: 'soon', // la figura, la tapa, la figurita, las tarjetas, Tu Temporada, logros, Versus
  shareCards: 'soon',
  weeklyRitual: 'soon', // desafío de la semana y Diario de la Zona
  stadium: 'soon', // estadio, Leyenda de la cancha, Complejo de la zona, sticker, Hora RIVAL
  requestCourt: 'soon', // "Pedí tu cancha"
  seasonZero: 'soon', // Temporada Cero y marca Fundador
} as const satisfies Record<string, LandingStatus>

export type LandingPiece = keyof typeof RIVAL_LANDING_STATUS

export const LANDING_STATUS_LABEL: Record<LandingStatus, string> = {
  available: 'Ya disponible',
  soon: 'Próximamente',
}
