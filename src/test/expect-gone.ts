import { waitFor } from 'storybook/test'

/**
 * Espera a que un nodo desaparezca del documento. Reemplaza a
 * `waitForElementToBeRemoved` en las stories, que **no sirve para esto** y falla
 * en las dos direcciones opuestas según el timing:
 *
 * 1. **Llega tarde** → `"The element(s) given to waitForElementToBeRemoved are
 *    already removed"`. Hace un chequeo de existencia AL ENTRAR y tira si el
 *    nodo ya se fue. Un diálogo que cierra rápido lo gatilla.
 * 2. **Llega temprano, sobre un descendiente** → cuelga hasta el timeout
 *    completo. Resuelve la raíz de búsqueda UNA sola vez, al invocarla, caminando
 *    `parentElement` (`@testing-library/dom`, `waitForElementToBeRemoved` →
 *    `initialCheck`). Si el contenedor ya se desprendió de su padre, la raíz que
 *    captura es ese contenedor huérfano — y `contenedor.contains(nieto)` sigue
 *    dando `true` para siempre, porque el subárbol desprendido queda intacto.
 *
 * Entre las dos no queda ventana: bajo la suite completa (258 archivos, todos
 * compitiendo por CPU) el mismo assert cae de un lado o del otro en corridas
 * distintas. Medido: la corrida 1 dio 2 rojos y la corrida 2 dio 6 **distintos**,
 * con las dos firmas de error mezcladas.
 *
 * `isConnected` no tiene el problema: no camina el árbol ni resuelve raíces, y
 * "ya no está" satisface la condición sin importar cuándo se fue.
 *
 * ```ts
 * await expectGone(dialogEl)                                  // ref capturada antes
 * await expectGone(() => body.queryByText('Guardado'))        // query diferida
 * ```
 */
export async function expectGone(
  target: HTMLElement | (() => HTMLElement | null),
  opts?: { timeout?: number },
): Promise<void> {
  // `throw` en vez de `expect(...)`: los matchers de `storybook/test` devuelven
  // promesa, y dentro de un callback síncrono eso queda flotando (lo marca
  // `no-floating-promises`). Un throw pelado es lo que `waitFor` espera para
  // reintentar, y deja un mensaje más claro que un booleano.
  await waitFor(
    () => {
      const el = typeof target === 'function' ? target() : target
      if (el !== null && el.isConnected) {
        throw new Error('El nodo sigue montado en el documento')
      }
    },
    { timeout: opts?.timeout ?? 5_000 },
  )
}
