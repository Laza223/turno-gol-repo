import type { FocusEvent, MouseEvent } from 'react'

/**
 * Seleccionar todo el texto de un campo de monto al enfocarlo.
 *
 * Diagnóstico Stream D (2026-09-15): editar EN EL SITIO un valor ya agrupado en
 * miles ("24.000" + una tecla al final, único lugar donde puede estar el caret)
 * lo corrompe — `money.ts` reinterpreta el separador de miles ya escrito como
 * coma decimal. Seleccionar todo el texto al enfocar hace que la PRIMERA tecla
 * reemplace el valor entero: el admin vuelve a escribir el monto en vez de
 * "corregirlo" por el medio, que es la única operación que rompe el parser. Vía
 * delegación de foco/mouse de React (bubblean desde React 17): no toca
 * `money-input.tsx` ni `SplitPaymentFields.tsx`.
 *
 * Los dos handlers van juntos, en el contenedor de los campos. `onFocus` solo no
 * alcanza en un click real: el navegador posiciona el caret en el punto tocado
 * como parte del propio `mousedown` (ANTES de que el `focus` corra `.select()`),
 * así que la selección queda pisada por el click que la originó — medido con
 * Storybook en Chromium real (el unit test con `fireEvent.focus` no lo agarra
 * porque no simula el mousedown). Frenar ese `mousedown` con `preventDefault`
 * cuando el campo TODAVÍA no estaba enfocado, y enfocarlo a mano, evita que el
 * navegador llegue a poner el caret — un click posterior con el campo YA
 * enfocado no entra acá y reposiciona el caret con normalidad (corregir un
 * dígito puntual).
 *
 * Lo comparten el panel de la Grilla y el modal de Hoy: el bug es de los campos,
 * no de la pantalla.
 */
export function selectAllOnMouseDown(e: MouseEvent<HTMLDivElement>) {
  const target = e.target
  if (
    target instanceof HTMLInputElement &&
    target.type === 'text' &&
    document.activeElement !== target
  ) {
    e.preventDefault()
    target.focus()
  }
}

export function selectAllOnFocus(e: FocusEvent<HTMLDivElement>) {
  const target = e.target
  if (target instanceof HTMLInputElement && target.type === 'text') target.select()
}
