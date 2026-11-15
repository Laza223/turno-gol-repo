'use client'

import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_LINK } from '@/components/world/portal-auth-styles'
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
    <section
      id="favoritos"
      aria-labelledby="favoritos-titulo"
      className="rv-panel glass-painted scroll-mt-20"
    >
      <h2
        id="favoritos-titulo"
        ref={headingRef}
        tabIndex={-1}
        className="rv-h2 focus-visible:outline-hidden"
      >
        Favoritos
      </h2>

      {visible.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className="rv-sub mt-0">
            Todavía no guardaste ningún complejo. Tocá el corazón en la página de un complejo para
            tenerlo acá.
          </p>
          <Link
            href="/explorar"
            className={cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))}
          >
            Explorar complejos
          </Link>
        </div>
      ) : (
        <ul>
          {visible.map((f) => (
            <li key={f.id} className="pa-rowl">
              <Link href={`/${f.slug}`} className={cn(PORTAL_LINK, 'min-w-0 py-1')}>
                <span className="pa-rowl__name">{f.name}</span>
                {f.city && <span className="pa-rowl__meta">{f.city}</span>}
              </Link>
              <button
                type="button"
                onClick={() => remove(f)}
                disabled={pendingId !== null}
                aria-label={`Quitar ${f.name} de favoritos`}
                className={cn(
                  buttonVariants({ variant: 'pill-link', size: 'pill-sm' }),
                  'disabled:text-portal-soft',
                )}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <p role="status" className="rv-small empty:-mt-3">
        {message}
      </p>
      {error && (
        <p role="alert" className="text-[13px] leading-5 text-portal-bad">
          {error}
        </p>
      )}
    </section>
  )
}
