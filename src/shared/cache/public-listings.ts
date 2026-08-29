import { revalidatePath, updateTag } from 'next/cache'

/**
 * Invalidación del contenido público que agrega complejos: el listado de
 * `/explorar` y la home.
 *
 * Existe porque las dos superficies cachean los MISMOS datos por caminos
 * distintos, y hasta ahora ninguna se enteraba de un cambio hecho desde el
 * panel del complejo:
 *
 *   * `/explorar` cachea la búsqueda sin filtros y el listado de ciudades con
 *     `unstable_cache` (`explorar/page.tsx`). Nacieron SIN `tags`, así que la
 *     única forma de invalidarlos era esperar los 300 s.
 *   * La home (`src/app/page.tsx`) llama a `searchPublicTenants` y
 *     `listPublicCities` sin caché de datos: la tapa el `revalidate = 300` de
 *     la página, que tampoco se invalidaba.
 *
 * Resultado: cambiar el nombre, el logo, la ciudad o el precio de una cancha
 * refrescaba `/${slug}` pero dejaba a `/explorar` y a la home mostrando lo
 * viejo hasta 5 minutos. Las Server Actions de `settings/perfil` y
 * `settings/canchas` llaman a esta función además de su `revalidatePath`.
 */
export const PUBLIC_TENANTS_TAG = 'public-tenants'
export const PUBLIC_CITIES_TAG = 'public-cities'

/**
 * `updateTag` y no `revalidateTag`: expira la entrada en el acto en vez de
 * servir lo viejo mientras regenera. El caso es un complejo que acaba de
 * guardar su nombre o su precio y va a mirar si se ve — con
 * stale-while-revalidate la primera visita después del guardado sigue mostrando
 * lo anterior, que es justo el síntoma que esto viene a arreglar.
 *
 * Contrapartida a tener presente: `updateTag` SOLO se puede llamar desde una
 * Server Action (Next 16). Si algún día hace falta invalidar esto desde un
 * Route Handler o un worker, ahí va `revalidateTag(tag, 'max')`.
 */
export function revalidatePublicListings(): void {
  updateTag(PUBLIC_TENANTS_TAG)
  updateTag(PUBLIC_CITIES_TAG)
  revalidatePath('/')
}
