/**
 * Lista CERRADA de zonas del perfil RIVAL (spec §7). La base la repite en un CHECK
 * cerrado (`players_zone_check`, migr. 099): sumar una zona pide una migración NUEVA que
 * reemplace ese CHECK y actualizar `tests/unit/rival-zones-sync.test.ts`. Es el corredor del piloto: se
 * amplía cuando se suman complejos (agregar una zona es aditivo).
 */
export const RIVAL_ZONES = [
  'Luján',
  'Jáuregui',
  'Open Door',
  'Torres',
  'Pueblo Nuevo',
  'Olivera',
  'Carlos Keen',
  'General Rodríguez',
  'Mercedes',
  'Pilar',
  'Moreno',
  'Exaltación de la Cruz',
  'Otra zona',
] as const
