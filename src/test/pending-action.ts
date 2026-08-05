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
 * Y no es un problema teórico de las stories que hoy fallan: el patrón está en
 * 10 archivos, y los que pasan lo hacen solo porque la story colgada quedó
 * ÚLTIMA en el archivo. Reordenar exports los pone en rojo.
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
        const deadline = Date.now() + 2_000
        while ((settledEl as HTMLButtonElement).disabled && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 10))
        }
      }
    },
  }
}
