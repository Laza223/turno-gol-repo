import { randomInt } from 'node:crypto'
import { and, eq, isNull, lte, notInArray } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { isUniqueViolation } from '@/shared/db/pg-errors'
import { REFERRAL_PROMO_ENDS_AT } from '@/shared/constants'
import {
  extractReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  referralCodeSchema,
} from './referral.schema'

const MAX_GENERATION_ATTEMPTS = 5

/** Un código nuevo, sin garantía de unicidad (la garantiza `ensureReferralCode`). */
export function generateReferralCode(): string {
  let code = ''
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)]
  }
  return code
}

/**
 * Código de referido del tenant: lo devuelve si ya existe, lo genera si no.
 *
 * Idempotente ante llamadas concurrentes: el `UPDATE ... WHERE referral_code
 * IS NULL` de la fila propia es la única escritura que compite consigo misma
 * (dos requests para el MISMO tenant); si el UPDATE no afecta ninguna fila es
 * porque la otra request ya ganó, y se relee para devolver ESE código en vez
 * de generar uno segundo que quedaría huérfano. La colisión de candidato
 * contra el código de OTRO tenant es lo que atrapa `isUniqueViolation` — con
 * 31^8 combinaciones es un evento raro, no el camino esperado.
 */
export async function ensureReferralCode(tenantId: string): Promise<string> {
  const db = getDb()

  const existing = await db
    .select({ referralCode: tenants.referralCode })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const current = existing[0]?.referralCode
  if (current) return current

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateReferralCode()
    try {
      const updated = await db
        .update(tenants)
        .set({ referralCode: candidate, updatedAt: new Date() })
        .where(and(eq(tenants.id, tenantId), isNull(tenants.referralCode)))
        .returning({ referralCode: tenants.referralCode })
      if (updated[0]?.referralCode) return updated[0].referralCode

      // 0 filas afectadas: o bien otro request ya seteó un código para este
      // mismo tenant entre nuestro SELECT y este UPDATE (releer y devolver
      // ese), o bien el tenantId no existe.
      const raced = await db
        .select({ referralCode: tenants.referralCode })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
      if (raced[0]?.referralCode) return raced[0].referralCode
      throw new Error(`ensureReferralCode: tenant ${tenantId} no encontrado`)
    } catch (err) {
      if (isUniqueViolation(err, 'tenants_referral_code')) continue
      throw err
    }
  }
  throw new Error('ensureReferralCode: no se pudo generar un código único tras varios intentos')
}

export type ResolvedReferral = { tenantId: string; name: string }

/** Un tenant en estos estados no tiene sentido recomendarlo: ya no existe/operó. */
const EXCLUDED_REFERRAL_STATUSES: Array<'deleted' | 'churned'> = ['deleted', 'churned']

/**
 * Código de la landing pública `/r/<CODE>` → tenant que lo emitió, o `null` si
 * el código no tiene forma válida, no existe, o pertenece a un complejo
 * `deleted`/`churned`. Proyección EXPLÍCITA a propósito: `tenants` es global y
 * sin RLS (`.claude/rules/tablas-y-rls.md`), así que la proyección es la única
 * barrera contra devolver de más.
 */
export async function resolveReferralCode(code: string): Promise<ResolvedReferral | null> {
  const parsed = referralCodeSchema.safeParse(code)
  if (!parsed.success) return null

  const db = getDb()
  const rows = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(
      and(
        eq(tenants.referralCode, parsed.data),
        notInArray(tenants.status, EXCLUDED_REFERRAL_STATUSES),
      ),
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { tenantId: row.id, name: row.name }
}

export type ResolveSignupReferrerInput = {
  /** `staff_users.signup_referral_code`, crudo y sin validar todavía. */
  code: string | null
  /** `staff_users.created_at` — la promo se mide contra cuándo se creó la
   *  CUENTA de staff, no contra cuándo termina el onboarding (que puede caer
   *  después del corte sin invalidar el referido). */
  staffCreatedAt: Date
  /** Defensa en profundidad contra que un tenant se auto-refiera: el CHECK
   *  `tenants_referred_by_not_self` (migr. 094) es la barrera real en la DB,
   *  pero pasar acá el id que se le va a asignar (si ya se conoce) evita
   *  incluso intentar el INSERT. */
  excludeTenantId?: string
}

/**
 * Resuelve el tenant referidor de una alta de staff nueva (B2), o `null` si
 * no corresponde atribuir ninguno. Un código ausente, con formato inválido,
 * inexistente, `deleted`/`churned`, vencido o auto-referido son todos casos
 * válidos de "sin referidor" — nunca tira por eso. `createTenantAction` es el
 * único responsable de decidir que un error de INFRA (DB caída) tampoco frene
 * el alta.
 */
export async function resolveSignupReferrer({
  code,
  staffCreatedAt,
  excludeTenantId,
}: ResolveSignupReferrerInput): Promise<string | null> {
  if (!code) return null
  if (staffCreatedAt.getTime() > REFERRAL_PROMO_ENDS_AT.getTime()) return null

  const referral = await resolveReferralCode(code)
  if (!referral) return null
  if (excludeTenantId && referral.tenantId === excludeTenantId) return null

  return referral.tenantId
}

export type AssignReferrerResult =
  | { ok: true; referrerName: string }
  | { ok: false; reason: 'invalid_code' | 'self' | 'not_eligible' }

/**
 * "Asignar referidor" manual (B2, panel SuperAdmin): para el complejo que
 * llegó por WhatsApp sin pasar por `/r/<CODE>`. Mismas reglas de negocio que
 * `resolveSignupReferrer`, pero la ventana de promo se mide contra
 * `tenants.created_at` (acá no hay `staff_users` de por medio) y se suman las
 * dos condiciones de "todavía elegible": sin referidor propio y sin premio en
 * curso. Van en el WHERE del UPDATE, no en un SELECT previo — así no hay
 * ventana de carrera entre validar y escribir, mismo criterio que
 * `ensureReferralCode`.
 */
export async function assignReferrer(
  tenantId: string,
  rawCode: string,
): Promise<AssignReferrerResult> {
  const code = extractReferralCode(rawCode)
  if (!code) return { ok: false, reason: 'invalid_code' }

  const referral = await resolveReferralCode(code)
  if (!referral) return { ok: false, reason: 'invalid_code' }
  if (referral.tenantId === tenantId) return { ok: false, reason: 'self' }

  const db = getDb()
  const updated = await db
    .update(tenants)
    .set({ referredByTenantId: referral.tenantId, updatedAt: new Date() })
    .where(
      and(
        eq(tenants.id, tenantId),
        isNull(tenants.referredByTenantId),
        isNull(tenants.referralRewardStatus),
        lte(tenants.createdAt, REFERRAL_PROMO_ENDS_AT),
      ),
    )
    .returning({ id: tenants.id })

  if (updated.length === 0) return { ok: false, reason: 'not_eligible' }
  return { ok: true, referrerName: referral.name }
}
