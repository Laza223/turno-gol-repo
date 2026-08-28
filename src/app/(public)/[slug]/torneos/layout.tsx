import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'

/**
 * Gate del módulo Torneos para todo `/{slug}/torneos/*`.
 *
 * Con el flag apagado el listado devolvía 200 con un cartel que decía que el
 * complejo "estará publicando los próximos torneos muy pronto" — una promesa
 * pública en nombre de un complejo que ni siquiera tiene el módulo (🟢 QA
 * 2026-08-28 F-04). Nada enlaza a esa URL (el perfil y el sitemap solo la
 * emiten si hay torneos publicados), así que se llega tipeándola: si el módulo
 * no está habilitado, la sección no existe y corresponde 404.
 *
 * Va en el layout y no en la page por el mismo motivo que el gate de existencia
 * del complejo: el `loading.tsx` de `[slug]` abre un `<Suspense>` y el 200 ya
 * salió en los headers para cuando la page llama `notFound()`. El layout
 * renderiza fuera de ese boundary. Ver `src/app/(public)/[slug]/layout.tsx`.
 *
 * Flag PRENDIDO y cero torneos publicados NO es 404: ahí el complejo sí tiene
 * el módulo y todavía no publicó nada, que es lo que el cartel dice.
 */
export default async function TorneosPublicosLayout(props: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await props.params
  const tenant = await getPublicTenant(slug)
  if (!tenant) notFound()
  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  return props.children
}
