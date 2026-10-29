import { useEffect, useState } from 'react'

/**
 * Errores por campo de un form de RIVAL: qué mensaje se ve, qué props lleva cada control, a cuál
 * se manda el foco y cómo se limpia el mensaje cuando el jugador edita ese campo.
 *
 * - `errors`: el mensaje de cada campo que devolvió el server en ESTE envío.
 * - `order`: los campos en el orden en que aparecen en el form. El primero con error lleva el
 *   único `role="alert"` (los demás son `<p>` comunes) y recibe el foco.
 * - `ids`: el `id` del control de cada campo (el `radiogroup` de un `ChipGroup`, el botón de un
 *   `SelectMenu`, un `<input>`).
 * - `resetKey`: cambia con cada respuesta nueva (el `state` del form). Trae de vuelta los
 *   mensajes limpiados y vuelve a mandar el foco, aunque el error sea el mismo del envío anterior.
 *
 * Después de un envío el foco queda en el body y lo que se corrigió seguía con su error: acá se
 * mueve al primer campo con error (centrado, para que no lo tape la barra inferior fija) y el
 * mensaje de un campo se va apenas se lo edita.
 */
export function useFieldErrors<K extends string>({
  errors,
  order,
  ids,
  resetKey,
}: {
  errors: Partial<Record<K, string>> | undefined
  order: readonly K[]
  ids: Record<K, string>
  resetKey: unknown
}) {
  const [seen, setSeen] = useState(resetKey)
  const [cleared, setCleared] = useState<readonly K[]>([])
  if (seen !== resetKey) {
    setSeen(resetKey)
    setCleared([])
  }

  const message = (field: K) => (cleared.includes(field) ? undefined : errors?.[field])
  const first = order.find((field) => message(field))

  // Solo al llegar una respuesta (o al cambiar de primer campo): `first` sale de `errors` sin
  // limpiados, que es lo que hay en el render donde `resetKey` cambia.
  useEffect(() => {
    if (!first) return
    const control = document.getElementById(ids[first])
    // El `radiogroup` de Radix no es enfocable: el foco va a la opción elegida o a la primera.
    const target =
      control?.getAttribute('role') === 'radiogroup'
        ? (control.querySelector<HTMLElement>('[role=radio][data-state=checked]') ??
          control.querySelector<HTMLElement>('[role=radio]'))
        : control
    if (!target) return
    target.focus({ preventScroll: true })
    target.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `first` e `ids` no cambian sin respuesta nueva
  }, [resetKey])

  return {
    /** El mensaje visible del campo, o `undefined` si no tiene o si el jugador ya lo editó. */
    message,
    /** Props del `<p>` del mensaje: solo el primer campo con error es `role="alert"`. */
    messageProps: (field: K) => ({
      id: `${ids[field]}-error`,
      ...(field === first ? { role: 'alert' as const } : {}),
    }),
    /** Props del control (`ChipGroup`, `SelectMenu`, casilla…): su `id` y, con error, aria. */
    controlProps: (field: K) =>
      message(field)
        ? {
            id: ids[field],
            'aria-invalid': true as const,
            'aria-describedby': `${ids[field]}-error`,
          }
        : { id: ids[field] },
    /** Llamar desde el `onChange` del campo. */
    clear: (field: K) => setCleared((prev) => (prev.includes(field) ? prev : [...prev, field])),
  }
}
