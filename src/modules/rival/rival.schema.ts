import { z } from 'zod'
import { REFERRAL_CODE_ALPHABET } from '@/modules/referrals/referral.schema'
import { toWhatsappDigits } from '@/lib/whatsapp'
import { artDateOf } from '@/shared/time/art-date'
import { uuid } from '@/shared/validation/primitives'
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
const startsAtSchema = z.coerce.date('Fecha y hora inválidas').superRefine((d, ctx) => {
  if (d.getTime() <= Date.now()) {
    ctx.addIssue({ code: 'custom', message: 'El partido tiene que ser a futuro.' })
    return
  }
  if (
    d.getUTCSeconds() !== 0 ||
    d.getUTCMilliseconds() !== 0 ||
    ![0, 30].includes(d.getUTCMinutes())
  ) {
    ctx.addIssue({ code: 'custom', message: 'La hora tiene que ser en punto o y media.' })
  }
  if (!isInRivalStartWindow(artDateOf(d))) {
    ctx.addIssue({ code: 'custom', message: 'Solo se puede armar hasta 7 días adelante.' })
  }
})

const formatSchema = z.coerce
  .number('Elegí el formato')
  .int()
  .min(4, 'El formato va de Fútbol 4 a Fútbol 11.')
  .max(11, 'El formato va de Fútbol 4 a Fútbol 11.')

const capacitySchema = z.coerce
  .number('Elegí cuántos juegan')
  .int()
  .min(2, 'Tienen que jugar al menos 2.')
  .max(22, 'Pueden jugar hasta 22.')

/** WhatsApp argentino de móvil, normalizado con `toWhatsappDigits` (54 9 + área + abonado). */
const whatsappSchema = z
  .string('Ingresá tu WhatsApp')
  .transform((raw) => toWhatsappDigits(raw))
  .pipe(
    z.string('WhatsApp inválido').regex(/^549\d{8,10}$/, 'Ingresá un WhatsApp argentino válido.'),
  )

/**
 * Publicar en el tablón (al armar o después). Lleva el WhatsApp con el
 * consentimiento explícito de ESA publicación: "Lo ve solo a quien aceptes en
 * este partido". "Busca rival" no lleva posición; "Buscamos jugadores" sí
 * (por defecto "Donde me pongan").
 */
export const publishBoardSchema = z
  .object({
    seeking: z.enum(RIVAL_SEEKING, 'Elegí qué buscás'),
    seekingPosition: z.enum(RIVAL_SEEKING_POSITIONS).optional(),
    whatsapp: whatsappSchema,
    whatsappConsent: z.literal(true, 'Tenés que aceptar que lo vea quien aceptes.'),
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
  }))

export const createRivalMatchSchema = z
  .object({
    tenantId: uuid,
    startsAt: startsAtSchema,
    format: formatSchema,
    /** Por defecto el formato × 2. En "Busca rival" es el formato. */
    capacity: capacitySchema.optional(),
    level: z.enum(RIVAL_LEVELS, 'Elegí el nivel'),
    /** Reserva `confirmed` del organizador en ese complejo y a esa hora (la valida la base). */
    bookingId: uuid.optional(),
    /** "Ya tengo la cancha": obligatoria si no hay reserva. No hay partidos sin cancha. */
    courtDeclared: z.boolean().default(false),
    /** Ausente = solo el grupo. */
    board: publishBoardSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.bookingId && !v.courtDeclared) {
      ctx.addIssue({
        code: 'custom',
        path: ['courtDeclared'],
        message: 'Confirmá que tenés la cancha.',
      })
    }
    if (v.board?.seeking === 'rival' && v.capacity !== undefined && v.capacity !== v.format) {
      ctx.addIssue({
        code: 'custom',
        path: ['capacity'],
        message: 'Buscando rival, juegan tantos como el formato.',
      })
    }
  })
  .transform((v) => ({
    tenantId: v.tenantId,
    startsAt: v.startsAt,
    format: v.format,
    capacity: v.board?.seeking === 'rival' ? v.format : (v.capacity ?? v.format * 2),
    level: v.level,
    bookingId: v.bookingId ?? null,
    courtDeclared: v.courtDeclared,
    board: v.board ?? null,
  }))

/** Bienvenida RIVAL (§7): nombre, posición y zona de la lista cerrada. */
export const rivalWelcomeSchema = z.object({
  firstName: z
    .string('Ingresá tu nombre')
    .trim()
    .min(1, 'Ingresá tu nombre.')
    .max(40, 'El nombre no puede superar los 40 caracteres.'),
  position: z.enum(RIVAL_POSITIONS, 'Elegí tu posición'),
  zone: z.enum(RIVAL_ZONES, 'Elegí tu zona'),
})

/** Denuncia de un partido (sin `reportedPlayerId`) o de una persona dentro de él. */
export const rivalReportSchema = z.object({
  matchId: uuid,
  reason: z.enum(RIVAL_REPORT_REASONS, 'Elegí el motivo'),
  reportedPlayerId: uuid.optional(),
})

export type RivalMatchDraft = z.output<typeof createRivalMatchSchema>
export type RivalBoardDraft = z.output<typeof publishBoardSchema>
export type RivalWelcomeInput = z.output<typeof rivalWelcomeSchema>
export type RivalReportReason = (typeof RIVAL_REPORT_REASONS)[number]
