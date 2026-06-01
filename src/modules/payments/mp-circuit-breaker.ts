/**
 * Circuit breaker en memoria para llamadas al gateway de MercadoPago.
 *
 * Máquina de estados por-key (key = tenant o gateway lógico):
 *
 *   closed    → pasa las llamadas. Cuenta fallos consecutivos. Un éxito resetea el contador.
 *   open      → falla rápido (CircuitOpenError) sin invocar la operación, durante `openMs`.
 *   half_open → al vencer el cooldown admite UNA sola request de prueba.
 *                 éxito → closed
 *                 fallo → open (reinicia el cooldown)
 *
 * Estado en memoria (Map), sin Redis: el cooldown de 60s tolera el reinicio de un
 * proceso serverless. Es deliberadamente per-proceso para v1.
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerOptions {
  /** Fallos consecutivos que abren el circuito. Default: 3. */
  failureThreshold?: number
  /** Milisegundos que el circuito permanece abierto antes de probar. Default: 60_000. */
  openMs?: number
  /** Reloj inyectable (para tests). Default: Date.now. */
  now?: () => number
}

/** Se lanza cuando el circuito está abierto y la operación no se ejecuta. */
export class CircuitOpenError extends Error {
  constructor(public readonly key: string) {
    super(`Circuit breaker open for "${key}"`)
    this.name = 'CircuitOpenError'
  }
}

interface CircuitEntry {
  state: CircuitState
  /** Fallos consecutivos mientras está closed. */
  failures: number
  /** Timestamp (ms) en que el circuito se abrió. */
  openedAt: number
  /** Hay una request de prueba en vuelo (half_open). */
  trialInFlight: boolean
}

export class CircuitBreaker {
  private readonly failureThreshold: number
  private readonly openMs: number
  private readonly now: () => number
  private readonly circuits = new Map<string, CircuitEntry>()

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3
    this.openMs = options.openMs ?? 60_000
    this.now = options.now ?? Date.now
  }

  /** Estado efectivo de la key (resuelve la transición lazy open→half_open por tiempo). */
  stateOf(key: string): CircuitState {
    const entry = this.circuits.get(key)
    if (!entry) return 'closed'
    return this.effectiveState(entry)
  }

  /**
   * Ejecuta `operation` a través del circuito.
   * @throws CircuitOpenError si el circuito está abierto (o ya hay un trial en vuelo).
   * @throws el error original de `operation` si la operación falla.
   */
  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const entry = this.getOrCreate(key)
    const state = this.effectiveState(entry)

    if (state === 'open') {
      throw new CircuitOpenError(key)
    }

    if (state === 'half_open') {
      // Solo se admite una request de prueba a la vez.
      if (entry.trialInFlight) {
        throw new CircuitOpenError(key)
      }
      // Reclamar el slot de prueba sincrónicamente, antes del primer await.
      entry.state = 'half_open'
      entry.trialInFlight = true
      try {
        const result = await operation()
        this.close(entry)
        return result
      } catch (error) {
        this.open(entry)
        throw error
      }
    }

    // closed
    try {
      const result = await operation()
      entry.failures = 0
      return result
    } catch (error) {
      entry.failures += 1
      if (entry.failures >= this.failureThreshold) {
        this.open(entry)
      }
      throw error
    }
  }

  /** Limpia el estado de una key, o de todas si no se pasa key. */
  reset(key?: string): void {
    if (key === undefined) {
      this.circuits.clear()
    } else {
      this.circuits.delete(key)
    }
  }

  private effectiveState(entry: CircuitEntry): CircuitState {
    if (entry.state === 'open' && this.now() - entry.openedAt >= this.openMs) {
      return 'half_open'
    }
    return entry.state
  }

  private getOrCreate(key: string): CircuitEntry {
    let entry = this.circuits.get(key)
    if (!entry) {
      entry = { state: 'closed', failures: 0, openedAt: 0, trialInFlight: false }
      this.circuits.set(key, entry)
    }
    return entry
  }

  private open(entry: CircuitEntry): void {
    entry.state = 'open'
    entry.openedAt = this.now()
    entry.trialInFlight = false
  }

  private close(entry: CircuitEntry): void {
    entry.state = 'closed'
    entry.failures = 0
    entry.trialInFlight = false
  }
}
