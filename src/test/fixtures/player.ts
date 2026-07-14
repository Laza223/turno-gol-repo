import { daysFromNow, hoursFromNow } from './clock'
import { uid } from './ids'

/**
 * `players` no tiene un `*.types.ts` propio (es una tabla global, sin
 * módulo de servicio con contrato público) — así que el shape se define acá
 * a mano, en base a CLAUDE.md ("Convenciones críticas de schema") y a los
 * campos que tocan `player.service.ts`/`player.anonymization.ts`. NO importar
 * esos archivos: son server-only (arrastran `getWorkerSql`).
 */
export type PlayerStatus = 'active' | 'banned' | 'anonymized'

export type PlayerRow = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  status: PlayerStatus
  /** Declaración jurada +18 (ADR-012). null = todavía no aceptó. */
  agreedToTermsAt: Date | null
  termsVersion: string | null
  lastLoginAt: Date | null
  createdAt: Date
}

export const player = (overrides: Partial<PlayerRow> = {}): PlayerRow => ({
  id: uid(201),
  email: 'tomas.ibanez@example.com',
  firstName: 'Tomás',
  lastName: 'Ibáñez',
  phone: '+54 9 11 3344-5566',
  status: 'active',
  agreedToTermsAt: daysFromNow(-120),
  termsVersion: '2026-01-01',
  lastLoginAt: hoursFromNow(-3),
  createdAt: daysFromNow(-200),
  ...overrides,
})

/** Segundo jugador de uso general (para grillas/listados con más de uno). */
export const playerAlt = (): PlayerRow =>
  player({
    id: uid(202),
    email: 'julian.alvarez@example.com',
    firstName: 'Julián',
    lastName: 'Álvarez',
    phone: '+54 9 11 2233-4455',
    lastLoginAt: hoursFromNow(-30),
  })

/** Nombre largo real (compuesto + apellido doble) para forzar el wrap de texto. */
export const playerLongName = (): PlayerRow =>
  player({
    id: uid(203),
    email: 'juan.ignacio.rodriguez.etchegoyen@example.com',
    firstName: 'Juan Ignacio',
    lastName: 'Rodríguez Etchegoyen',
    phone: '+54 9 11 5566-7788',
  })

/** Softban activo por reincidencia de no-show (ver tenant_player_bans). */
export const playerBanned = (): PlayerRow =>
  player({
    id: uid(204),
    email: 'nahuel.gimenez@example.com',
    firstName: 'Nahuel',
    lastName: 'Giménez',
    status: 'banned',
    lastLoginAt: daysFromNow(-3),
  })

/** Eliminación ARCO (Ley 25.326) — datos personales ya anonimizados. */
export const playerAnonymized = (): PlayerRow =>
  player({
    id: uid(205),
    email: 'eliminado-205@turnogol.app',
    firstName: 'Usuario',
    lastName: 'Eliminado',
    phone: null,
    status: 'anonymized',
    agreedToTermsAt: null,
    termsVersion: null,
    lastLoginAt: null,
  })

export const players = (): PlayerRow[] => [
  player(),
  playerAlt(),
  playerLongName(),
  playerBanned(),
  playerAnonymized(),
]
