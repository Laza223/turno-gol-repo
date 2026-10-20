'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_LINK, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { rejectionMessage } from '@/shared/lib/rejection-message'

/** Lo mínimo de un complejo favorito: a dónde ir y cómo se llama. Sin precios ni fotos. */
export type FavoriteRow = {
  id: string
  slug: string
  name: string
  city: string
}

/** POST al toggle del complejo (no hay un endpoint de borrado idempotente). */
function toggle(tenantId: string): Promise<Response> {
  return fetch('/api/player/favorites/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId }),
  })
}

const REMOVE_ERROR = 'No pudimos quitarlo de tus favoritos. Probá de nuevo.'

/** Acción sin borde del portal (la misma receta que "Cancelar" en Mis reservas): 44 px de toque. */
const GHOST =
  'inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground'

/**
 * Los complejos guardados del jugador: una fila por complejo, con su nombre, su localidad y un
 * link a su página. Al quitar uno la fila desaparece al instante (el POST al toggle ya lo borró).
 * La sección se dibuja entera acá porque su contenido cambia en el cliente.
 */
export default function FavoritesList({ favorites }: { favorites: FavoriteRow[] }) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const visible = favorites.filter((f) => !removed.has(f.id))

  async function remove(favorite: FavoriteRow) {
    if (pendingId) return
    setPendingId(favorite.id)
    setError(null)
    setMessage(null)
    try {
      let res = await toggle(favorite.id)
      if (res.status === 401) {
        window.location.assign(`/ingresar?next=${encodeURIComponent('/configuracion#favoritos')}`)
        return
      }
      if (!res.ok) {
        setError(await rejectionMessage(res, REMOVE_ERROR))
        return
      }
      let json = (await res.json()) as { data?: { favorited?: boolean } }
      // El endpoint alterna: `favorited: true` es que otra pestaña ya lo había quitado y acabamos de
      // volver a guardarlo. Se llama una vez más para dejarlo quitado, que es lo que pidió el jugador.
      if (json.data?.favorited === true) {
        res = await toggle(favorite.id)
        if (!res.ok) {
          setError(await rejectionMessage(res, REMOVE_ERROR))
          return
        }
        json = (await res.json()) as { data?: { favorited?: boolean } }
        if (json.data?.favorited === true) {
          setError(REMOVE_ERROR)
          return
        }
      }
      setRemoved((prev) => new Set(prev).add(favorite.id))
      setMessage(`Quitaste ${favorite.name} de tus favoritos.`)
      // La fila donde estaba el foco ya no existe: el foco vuelve al título de la sección.
      headingRef.current?.focus()
    } catch {
      setError(REMOVE_ERROR)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section id="favoritos" aria-labelledby="favoritos-titulo" className="scroll-mt-20">
      <h2
        id="favoritos-titulo"
        ref={headingRef}
        tabIndex={-1}
        className={cn(PORTAL_SECTION_TITLE, 'focus-visible:outline-hidden')}
      >
        Favoritos
      </h2>

      {visible.length === 0 ? (
        <div className="mt-3">
          <p className="text-base text-muted-foreground">
            Todavía no guardaste ningún complejo. Tocá el corazón en la página de un complejo para
            tenerlo acá.
          </p>
          <Link
            href="/explorar"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'mt-4 h-auto min-h-11 md:h-auto shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 focus-visible:ring-offset-background',
            )}
          >
            Explorar complejos
          </Link>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {visible.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <Link
                href={`/${f.slug}`}
                className={cn(
                  PORTAL_LINK,
                  'flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2',
                )}
              >
                <span className="break-words text-base font-medium text-foreground">{f.name}</span>
                {f.city && (
                  <span className="break-words text-sm text-muted-foreground">{f.city}</span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => remove(f)}
                disabled={pendingId !== null}
                aria-label={`Quitar ${f.name} de favoritos`}
                className={GHOST}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {message}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-5 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}
