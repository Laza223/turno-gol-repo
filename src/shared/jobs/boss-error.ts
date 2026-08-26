/**
 * Qué decir cuando pg-boss reporta un error.
 *
 * ─── Por qué existe ──────────────────────────────────────────────────────────
 *
 * pg-boss **no emite un `Error`**. `manager.js:256` (v9.0.3) emite un objeto
 * plano:
 *
 * ```js
 * this.emit(events.error, { ...error, message: error.message, stack: error.stack,
 *                          queue: name, worker: id })
 * ```
 *
 * El handler decía `err instanceof Error ? err.message : String(err)`, y como
 * ese objeto no es un `Error`, caía en `String(...)`: **`[object Object]`**.
 *
 * No es teoría. El 2026-08-26, justo después de prender *Enforce SSL* en
 * Supabase, el worker de Railway emitió 14 de estos en 5 segundos y lo único
 * que quedó —en el log Y en Sentry (`SENTRY-COQUELICOT-SCHOOL-N`)— fue:
 *
 * ```
 * Contexto:
 *     error = [object Object]
 *     message = pg-boss error
 * ```
 *
 * O sea que el motor de colas —el que corre el dunning de suscripciones, la
 * reconciliación de pagos y la generación de slots— tenía su ÚNICO canal de
 * error escribiendo nada. Y el objeto traía justo lo que hacía falta:
 * `message`, `stack`, y sobre todo **`queue` y `worker`**, que dicen CUÁL de
 * los 15 consumidores se rompió.
 *
 * ─── Qué hace ────────────────────────────────────────────────────────────────
 *
 * Aplana las tres formas posibles a campos planos que el logger manda a Sentry
 * como contexto. Nunca vuelca el objeto entero: un error de Postgres arrastra
 * el texto de la query, que puede traer datos de una persona (Ley 25.326). Si
 * no hay `message`, informa las CLAVES que venían — sirve para diagnosticar sin
 * copiar valores.
 */

export type BossErrorInfo = {
  /** Siempre presente: nunca `[object Object]`, nunca vacío. */
  error: string
  code?: string
  queue?: string
  worker?: string
  stack?: string
}

function text(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v
  return undefined
}

function compact(info: BossErrorInfo): BossErrorInfo {
  return Object.fromEntries(
    Object.entries(info).filter(([, v]) => v !== undefined),
  ) as BossErrorInfo
}

export function describeBossError(err: unknown): BossErrorInfo {
  if (err instanceof Error) {
    const extra = err as unknown as Record<string, unknown>
    return compact({
      error: err.message || err.name,
      code: text(extra.code),
      queue: text(extra.queue),
      worker: text(extra.worker),
      stack: err.stack,
    })
  }

  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>
    const keys = Object.keys(o)
    return compact({
      // El fallback nombra las claves, no los valores: sirve para diagnosticar
      // sin arrastrar el texto de una query a Sentry.
      error: text(o.message) ?? `error de pg-boss sin message (claves: ${keys.join(', ')})`,
      code: text(o.code),
      queue: text(o.queue),
      worker: text(o.worker),
      stack: text(o.stack),
    })
  }

  // `String('')` es `''`, y un error vacío en el log es exactamente el mismo
  // problema que `[object Object]`: una línea que no dice nada.
  return { error: text(String(err)) ?? `error de pg-boss no interpretable (${typeof err})` }
}
