/**
 * Server Action mockeada que queda "en vuelo" hasta que el `play` la libera.
 *
 * El problema que resuelve, medido: las stories del estado "Enviando" usaban
 * `fn(() => new Promise(() => {}))` — una promesa que NUNCA resuelve — para
 * dejar el spinner estable y poder mirarlo. Eso deja viva una transición de
 * React que jamás termina, y como la transición vive en el scheduler (no en la
 * instancia del componente), **contamina a las stories siguientes del mismo
 * archivo**: sus actions resuelven, pero React no puede commitear la
 * actualización porque hay una transición previa sin cerrar. El síntoma es
 * desconcertante — la story siguiente falla por no encontrar un `role="alert"`
 * que su propio código sí renderiza.
 *
 * Detalle importante para no confundirse diagnosticando: un remount por story
 * (`key` en el decorator) NO alcanza. La transición no es del componente.
 *
 * Y no es un problema teórico de las stories que hoy fallan: los que pasan lo
 * hacen solo porque la story colgada quedó ÚLTIMA en el archivo. Reordenar
 * exports los pone en rojo.
 *
 * **El grep NO alcanza para decidir si un archivo hay que migrarlo** (aprendido
 * el 2026-08-06 rompiendo uno). Esto solo aplica si el componente corre la
 * acción dentro de una TRANSICIÓN de React. Verificar el componente primero:
 *
 * ```
 * grep -cE "useTransition|useActionState|startTransition" <componente>.tsx
 * ```
 *
 * Cuenta también `<form action={…}>` (React 19 lo corre en transición) y heredar
 * la transición de un hijo — `impersonate-button` la recibe de `ConfirmDialog`.
 * Si el componente usa un `useState` de `busy` y un `await` normal, NO hay
 * transición: aplicar el helper ahí introduce una espera que el flujo real no
 * tiene y la story muere por timeout (caso medido: `image-uploader.stories.tsx`,
 * `Test timed out in 30000ms`).
 *
 * Inventario al 2026-08-06 (`git grep -lE "new Promise(<[^>]*>)?\(\(\) => \{\}\)" -- "*.stories.tsx"`):
 * 12 archivos. Migrados los 4 que tienen transición Y stories después de la
 * colgada. De los que quedan, los que tienen transición están colgados en su
 * ÚLTIMA story (seguros por posición, no por diseño: reordenar exports los
 * rompe) y el resto no tiene transición. Cuidado con `StepIdentity.stories.tsx`,
 * que declara una variable local llamada `pendingAction` sin importar este
 * helper: un grep por nombre lo cuenta como migrado y no lo está.
 *
 * Uso:
 * ```ts
 * const enviando = pendingAction<MiEstado>({ status: 'idle' })
 *
 * export const Enviando: Story = {
 *   args: { action: fn(enviando.action) },
 *   play: async ({ canvasElement }) => {
 *     const canvas = within(canvasElement)
 *     await userEvent.click(canvas.getByRole('button', { name: 'Enviar' }))
 *     await expect(await canvas.findByText('Enviando…')).toBeInTheDocument()
 *     await enviando.release(canvas.getByRole('button'))
 *   },
 * }
 * ```
 *
 * `release` acepta el botón opcionalmente para esperar a que React termine de
 * commitear: sin esa espera la story podría terminar con la transición todavía
 * cerrándose, que es justo el estado que esto vino a evitar.
 */
export function pendingAction<T>(resolvedValue: T): {
  /** La función a pasarle al componente (envolvela en `fn()` si querés el spy). */
  action: () => Promise<T>
  /** Libera TODAS las llamadas en vuelo y espera el commit de React. */
  release: (settledEl?: HTMLElement) => Promise<void>
} {
  const inFlight: Array<() => void> = []

  return {
    action: () =>
      new Promise<T>((resolve) => {
        inFlight.push(() => resolve(resolvedValue))
      }),
    release: async (settledEl?: HTMLElement) => {
      for (const resolve of inFlight.splice(0)) resolve()
      // Dos macrotasks: la primera deja resolver la promesa, la segunda deja a
      // React commitear la transición. Con el botón a mano, además esperamos a
      // que deje de estar deshabilitado — evidencia real de que salió de pending.
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      if (settledEl) {
        // Tope por CANTIDAD de vueltas, no por `Date.now() + 2_000`: el preview
        // de Storybook congela `Date.now()` (`.storybook/preview.tsx`, "reloj
        // congelado") para toda story — un deadline armado con él no vence
        // nunca, y el loop queda vivo hasta el timeout del test (medido:
        // StepFirstBooking.stories.tsx, 30s). `setTimeout` sigue siendo real
        // ahí, así que 200 vueltas de 10ms es el mismo presupuesto (~2s) pero
        // medido en wall-clock real, no en el reloj mockeado.
        //
        // Segunda condición de salida, `!document.contains(settledEl)`: no
        // todos los componentes vuelven a habilitar el MISMO botón al
        // terminar — StepFirstBooking, por ejemplo, lo DESMONTA (la mini-form
        // entera se reemplaza por el banner de éxito). Sobre un nodo ya
        // desconectado del documento, `.disabled` se queda en `true` para
        // siempre: solo el chequeo de adjunto lo destraba.
        for (let i = 0; i < 200; i++) {
          const stillDisabled = (settledEl as HTMLButtonElement).disabled
          const stillAttached = document.contains(settledEl)
          if (!stillDisabled || !stillAttached) break
          await new Promise((r) => setTimeout(r, 10))
        }
      }
    },
  }
}
