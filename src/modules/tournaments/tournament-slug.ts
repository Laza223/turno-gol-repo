import { generateSlug } from '@/modules/tenants/tenant.utils'

/**
 * Base del slug de un torneo a partir de su nombre.
 *
 * `generateSlug` limpia los guiones de los extremos y RECIÉN DESPUÉS trunca a
 * 50 caracteres, así que un nombre largo puede quedar cortado justo en un guión
 * — y `chk_tournament_slug_format` lo rechazaría con un 23514 crudo. Se recorta
 * acá. (El mismo patrón existe en los slugs de complejo; arreglarlo allá es un
 * cambio aparte porque movería slugs ya publicados.)
 *
 * Vive en su propio archivo, sin dependencias de servidor, para poder testearlo
 * sin levantar el cliente de DB.
 */
export function tournamentSlugBase(name: string): string {
  return generateSlug(name).replace(/-+$/, '') || 'torneo'
}
