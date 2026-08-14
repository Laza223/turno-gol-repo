import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getPublicTenant } from '@/modules/tenants/public.service'

/**
 * Gate de existencia del complejo para TODO el árbol `/{slug}/*`.
 *
 * Existe por el status HTTP, no por el contenido (🔴 QA 2026-08-13): las pages
 * ya llamaban `notFound()` y el `not-found.tsx` de este segmento ya mostraba
 * "Complejo no encontrado", pero la respuesta salía **200 OK** — un soft-404 que
 * Google indexa. La causa la confirmó un control negativo contra `next dev`:
 *
 *   /{slug-inexistente}                 → 200  (tiene loading.tsx)
 *   /{slug-inexistente}/disponibilidad  → 200  (tiene loading.tsx; force-dynamic,
 *                                               así que no era la caché de ISR)
 *   /blog/{slug-inexistente}            → 404  (sin loading.tsx en su cadena)
 *   /para-complejos/foo/bar             → 404  (no matchea ninguna ruta)
 *
 * El `loading.tsx` del segmento mete un `<Suspense>`, Next arranca a stremear la
 * respuesta —con los headers y el 200 ya emitidos— y para cuando la page llama
 * `notFound()` el status ya no se puede cambiar. El layout, en cambio, renderiza
 * FUERA de ese boundary: acá el `notFound()` llega a tiempo.
 *
 * Solo chequea EXISTENCIA. El 200 de un complejo suspendido (`page.tsx`) es
 * deliberado y sigue viviendo en la page; `getPublicTenant` está memoizado con
 * `cache()`, así que esta consulta no agrega un viaje a la DB.
 */
export default async function SlugLayout(props: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await props.params
  const tenant = await getPublicTenant(slug)
  if (!tenant) notFound()

  return props.children
}
