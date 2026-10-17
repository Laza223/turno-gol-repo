'use client'

import { useEffect, useRef, useState } from 'react'
import { BOOKING_INTENT_PARAM } from '@/lib/booking/reserve-url'

const STORAGE_PREFIX = 'tg-auto-confirm:'

/**
 * La confirmación sola: el jugador ya tocó "Continuar" una vez y vuelve del ingreso con un vínculo
 * firmado válido (la page lo verificó); este componente envía el form de confirmar por él. Vive
 * DENTRO del form (`ConfirmBookingButton`) y lo busca con `closest`, así el envío es el mismo de
 * siempre: la action re-verifica el vínculo y el botón sigue visible ("Procesando…" mientras envía).
 * Si JS no corre, el jugador toca el botón.
 *
 * El `role="status"` viaja desde el servidor VACÍO y con su alto reservado (`min-h-6` = la línea de
 * 16 px): sin JS no queda un "Confirmando…" eterno, el primer pintado no contradice al botón y el
 * texto, que se pone al montar, entra sin mover nada y el lector de pantalla lo anuncia.
 *
 * UN solo envío, por tres guardas distintas:
 * - `started` (ref): StrictMode monta dos veces y los refs sobreviven a ese segundo montaje.
 * - `sessionStorage`, con una clave derivada del TURNO (nunca el vínculo): una recarga o un Atrás
 *   que vuelve a montar la pantalla no reenvía, y otro turno sí. Los primeros caracteres de un
 *   vínculo son iguales entre turnos del mismo complejo, así que no sirven de clave.
 * - el vínculo sale de la URL con `replaceState` ANTES de enviar: lo que quede en el historial ya
 *   no confirma nada.
 */
export default function AutoConfirm({
  slug,
  court,
  date,
  time,
  onConfirming,
}: {
  slug: string
  court: string
  date: string
  time: string
  /** Avisa, una vez y antes de enviar, que arranca: lo que ya no se puede cambiar se bloquea. */
  onConfirming?: () => void
}) {
  const status = useRef<HTMLParagraphElement>(null)
  const started = useRef(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const form = status.current?.closest('form')
    const key = `${STORAGE_PREFIX}${[slug, court, date, time].join('|')}`
    let alreadySent = false
    try {
      alreadySent = window.sessionStorage.getItem(key) !== null
      if (!alreadySent) window.sessionStorage.setItem(key, '1')
    } catch {
      // Sin sessionStorage (modo privado): queda el guard del ref.
    }
    // No hay nada que enviar: no se dice que se está confirmando.
    if (!form || alreadySent) return

    const url = new URL(window.location.href)
    url.searchParams.delete(BOOKING_INTENT_PARAM)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setConfirming(true)
    onConfirming?.()
    form.requestSubmit()
  }, [slug, court, date, time, onConfirming])

  return (
    <p ref={status} role="status" className="mb-3 min-h-6 text-base text-muted-foreground">
      {confirming ? 'Confirmando tu reserva…' : null}
    </p>
  )
}
