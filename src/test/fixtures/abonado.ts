import type { AbonadoRow } from '@/modules/abonados/abonado.types'
import { daysFromNow } from './clock'
import { uid } from './ids'
import { courtFutbol5, courtFutbol7 } from './court'
import { playerAlt } from './player'
import { tenant } from './tenant'

/**
 * Default: abonado activo de los martes, con jugador registrado vinculado.
 * Sin crédito/saldo a favor ni monthlyPrice (eliminados, ver CLAUDE.md) — solo
 * `pricePerSession`.
 */
export const abonado = (overrides: Partial<AbonadoRow> = {}): AbonadoRow => ({
  id: uid(501),
  tenantId: tenant().id,
  courtId: courtFutbol5().id,
  playerId: playerAlt().id,
  contactName: 'Julián Álvarez',
  contactPhone: '+54 9 11 2233-4455',
  dayOfWeek: 2, // martes
  timeStart: '20:00',
  timeEnd: '21:00',
  pricePerSession: 1300000,
  startsOn: daysFromNow(-90),
  endsOn: null,
  status: 'active',
  paymentMethod: 'cash',
  notes: null,
  createdAt: daysFromNow(-90),
  updatedAt: daysFromNow(-7),
  ...overrides,
})

/** Grupo sin jugador registrado en la plataforma — solo datos de contacto. */
export const abonadoGuestOnly = (): AbonadoRow =>
  abonado({
    id: uid(502),
    courtId: courtFutbol7().id,
    playerId: null,
    contactName: 'Grupo "Los Veteranos" — Damián Echeverría',
    contactPhone: '+54 9 11 7788-9900',
    dayOfWeek: 4, // jueves
    timeStart: '21:00',
    timeEnd: '22:00',
    pricePerSession: 1300000,
    paymentMethod: 'transfer',
  })

/** Pausado temporalmente (vacaciones de invierno, retoma en fecha a confirmar). */
export const abonadoPaused = (): AbonadoRow =>
  abonado({
    id: uid(503),
    playerId: null,
    contactName: 'Nicolás Paredes',
    contactPhone: '+54 9 11 3344-2211',
    dayOfWeek: 1, // lunes
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'paused',
    notes: 'Pausado hasta nuevo aviso — el grupo se achicó en vacaciones de invierno.',
  })

/** Dado de baja definitivamente. */
export const abonadoCanceled = (): AbonadoRow =>
  abonado({
    id: uid(504),
    playerId: null,
    contactName: 'Sebastián Maximiliano Villalba Etcheverry',
    contactPhone: '+54 9 11 6677-8899',
    dayOfWeek: 5, // viernes
    timeStart: '18:00',
    timeEnd: '19:00',
    status: 'canceled',
    endsOn: daysFromNow(-15),
    notes: 'El grupo se disolvió, dejaron de venir todos los viernes.',
  })

export const abonados = (): AbonadoRow[] => [abonado(), abonadoGuestOnly(), abonadoPaused(), abonadoCanceled()]
