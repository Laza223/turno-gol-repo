import { z } from 'zod'
import { REFERRAL_CODE_ALPHABET } from '@/modules/referrals/referral.schema'
import { toWhatsappDigits } from '@/lib/whatsapp'
import { artDateOf } from '@/shared/time/art-date'
import { isUuid, uuid } from '@/shared/validation/primitives'
import { RIVAL_ZONES } from './rival-zones'
import { isInRivalStartWindow } from './rival-window'

// Mensajes en es-AR (la Server Action los muestra tal cual). Todos los valores
// cerrados replican los CHECK de la migración 099: cambiar uno acá sin la
// migración deja valores válidos para Zod que la base rechaza.

export const RIVAL_LEVELS = ['tranqui', 'parejo', 'picante'] as const
export const RIVAL_POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward', 'any'] as const
/** Qué busca un partido publicado: jugadores o un equipo rival. */
export const RIVAL_SEEKING = ['players', 'rival'] as const
/** Posición que se busca cuando se buscan jugadores: "Donde me pongan" o "Arquero". */
export const RIVAL_SEEKING_POSITIONS = ['any', 'goalkeeper'] as const
/** "El partido no existe" · "Es spam o publicidad" · "Nombre o foto ofensivos" · "Parece menor de 18". */
export const RIVAL_REPORT_REASONS = ['not_exists', 'spam', 'offensive', 'minor'] as const

const INVITE_CODE_RE = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{10}$`)

/** Código del link `/rival/p/<code>`: 10 símbolos del alfabeto de los referidos (mayúsculas). */
export const inviteCodeSchema = z.string().regex(INVITE_CODE_RE, 'Código de partido inválido')

/**
 * Inicio del partido: instante futuro, en punto o y media, dentro de hoy..+7
 * días ART. El día se mide con el reloj ART (UTC-3 fijo), nunca con el día UTC:
 * a las 22:00 ART ya es el día siguiente en UTC.
 */
const startsAtSchema = z.coerce.date('Elegí la hora de inicio.').superRefine((d, ctx) => {
  if (d.getTime() <= Date.now()) {
    ctx.addIssue({ code: 'custom', message: 'Elegí un horario a futuro: ese ya pasó.' })
    return
  }
  if (
    d.getUTCSeconds() !== 0 ||
    d.getUTCMilliseconds() !== 0 ||
    ![0, 30].includes(d.getUTCMinutes())
  ) {
    ctx.addIssue({ code: 'custom', message: 'Elegí una hora en punto o y media.' })
  }
  if (!isInRivalStartWindow(artDateOf(d))) {
    ctx.addIssue({
      code: 'custom',
      message: 'Solo se puede armar hasta 7 días adelante. Elegí un día más cercano.',
    })
  }
})

const formatSchema = z.coerce
  .number('Elegí el formato: de Fútbol 4 a Fútbol 11.')
  .int('Elegí el formato: de Fútbol 4 a Fútbol 11.')
  .min(4, 'Elegí el formato: de Fútbol 4 a Fútbol 11.')
  .max(11, 'Elegí el formato: de Fútbol 4 a Fútbol 11.')

const capacitySchema = z.coerce
  .number('Elegí cuántos juegan.')
  .int()
  .min(2, 'Tienen que jugar al menos 2.')
  .max(22, 'Pueden jugar hasta 22.')

const WHATSAPP_INVALID_MESSAGE =
  'Revisá el WhatsApp: tiene que ser de Argentina, con código de área y sin 0 ni 15. Ejemplo: 11 2345 6789.'

/** WhatsApp argentino de móvil, normalizado con `toWhatsappDigits` (54 9 + área + abonado). */
const whatsappSchema = z
  .string({ error: 'Ingresá tu WhatsApp.' })
  .trim()
  .min(1, 'Ingresá tu WhatsApp.')
  .transform((raw) => toWhatsappDigits(raw))
  .pipe(
    z.string({ error: WHATSAPP_INVALID_MESSAGE }).regex(/^549\d{8,10}$/, WHATSAPP_INVALID_MESSAGE),
  )

/**
 * Publicar en el tablón, después de armar. Lleva el WhatsApp con el
 * consentimiento explícito de ESA publicación: "Mi WhatsApp lo ve solo quien
 * yo acepte en este partido". "Busca rival" no lleva posición; "Buscamos jugadores" sí
 * (por defecto "Donde me pongan").
 */
export const publishBoardSchema = z
  .object({
    seeking: z.enum(RIVAL_SEEKING, 'Elegí si buscás jugadores o rival.'),
    seekingPosition: z.enum(RIVAL_SEEKING_POSITIONS).optional(),
    whatsapp: whatsappSchema,
    whatsappConsent: z.literal(
      true,
      'Marcá la casilla para publicar: tu WhatsApp lo ve solo quien aceptes.',
    ),
    /** Opt-in aparte del consentimiento: guarda el número en `players.phone`. */
    savePhone: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.seeking === 'rival' && v.seekingPosition !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['seekingPosition'],
        message: 'Buscar rival no lleva posición.',
      })
    }
  })
  .transform((v) => ({
    seeking: v.seeking,
    seekingPosition: v.seeking === 'players' ? (v.seekingPosition ?? 'any') : null,
    whatsappDigits: v.whatsapp,
    savePhone: v.savePhone === true,
  }))

/** Un solo texto para la cancha: lo usa el form, el schema y el copy del error de la base. */
export const COURT_REQUIRED_MESSAGE = 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.'

export const createRivalMatchSchema = z
  .object({
    tenantId: z.string({ error: 'Elegí el complejo.' }).refine(isUuid, 'Elegí el complejo.'),
    startsAt: startsAtSchema,
    format: formatSchema,
    /** Por defecto el formato × 2. En "Mi equipo busca rival" el form lo manda igual al formato. */
    capacity: capacitySchema.optional(),
    level: z.enum(RIVAL_LEVELS, 'Elegí el nivel del partido.'),
    /** Reserva `confirmed` del organizador en ese complejo y a esa hora (la valida la base). */
    bookingId: uuid.optional(),
    /** "Ya tengo la cancha": obligatoria si no hay reserva. No hay partidos sin cancha. */
    courtDeclared: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.bookingId && !v.courtDeclared) {
      ctx.addIssue({ code: 'custom', path: ['courtDeclared'], message: COURT_REQUIRED_MESSAGE })
    }
  })
  .transform((v) => ({
    tenantId: v.tenantId,
    startsAt: v.startsAt,
    format: v.format,
    capacity: v.capacity ?? v.format * 2,
    level: v.level,
    bookingId: v.bookingId ?? null,
    courtDeclared: v.courtDeclared,
  }))

/** Bienvenida RIVAL (§7), primer momento (alcanza para armar): el nombre y las reglas. */
export const rivalIdentitySchema = z.object({
  firstName: z
    .string({ error: 'Ingresá tu nombre' })
    .trim()
    .min(1, 'Ingresá tu nombre.')
    .max(40, 'El nombre no puede superar los 40 caracteres.'),
})

/** Segundo momento (al sumarse o pedir sumarse): posición y zona de la lista cerrada. */
export const rivalProfileSchema = z.object({
  position: z.enum(RIVAL_POSITIONS, 'Elegí tu posición'),
  zone: z.enum(RIVAL_ZONES, 'Elegí tu zona'),
})

/** Capitán de un equipo rival (decisión 15): solo la zona; la posición no se le pide. */
export const rivalZoneSchema = rivalProfileSchema.pick({ zone: true })

/** Denuncia de un partido (sin `reportedPlayerId`) o de una persona dentro de él. */
export const rivalReportSchema = z.object({
  matchId: uuid,
  reason: z.enum(RIVAL_REPORT_REASONS, 'Elegí el motivo'),
  reportedPlayerId: uuid.optional(),
})

export type RivalMatchDraft = z.output<typeof createRivalMatchSchema>
export type RivalBoardDraft = z.output<typeof publishBoardSchema>
type RivalProfileInput = z.output<typeof rivalProfileSchema>
/** Perfil a guardar: la zona siempre, la posición solo si se pidió (no se pisa con null). */
export type RivalProfileUpdate = z.output<typeof rivalZoneSchema> & Partial<RivalProfileInput>
/** Lo que guarda `acceptRivalWelcome`: el nombre, y posición y zona solo si vinieron. */
export type RivalWelcomeInput = z.output<typeof rivalIdentitySchema> & Partial<RivalProfileInput>
export type RivalReportReason = (typeof RIVAL_REPORT_REASONS)[number]
