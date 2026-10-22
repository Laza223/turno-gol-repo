import type { StatusTone } from '@/lib/status-tone'
import { REFERRAL_REWARD_CAP } from '@/shared/constants'

export type ReferralStatusCopy = { label: string; detail: string; tone: StatusTone }

/**
 * Estado del premio (`tenants.referral_reward_status`, CHECK de la migr. 094)
 * en palabras del dueño. Voz de empresa, sin prometer plazos ni montos.
 */
const COPY: Record<
  'pending' | 'earned' | 'manual_pending' | 'applied' | 'rejected' | 'over_cap',
  ReferralStatusCopy
> = {
  pending: {
    label: 'Se registró',
    detail: 'Todavía no pagó su primer mes.',
    tone: 'neutral',
  },
  earned: { label: 'Ya pagó', detail: 'Lo estamos revisando.', tone: 'info' },
  manual_pending: {
    label: 'Aprobado',
    detail: 'Te devolvemos tu próximo cobro.',
    tone: 'success',
  },
  applied: { label: 'Mes acreditado', detail: 'Ya lo tenés.', tone: 'success' },
  rejected: { label: 'No suma', detail: 'Este invitado no suma un mes.', tone: 'destructive' },
  over_cap: {
    label: 'Sin mes extra',
    detail: `Llegaste al tope de ${REFERRAL_REWARD_CAP} meses.`,
    tone: 'neutral',
  },
}

/** `null` (o un valor que no conocemos) se lee como "todavía no pagó". */
export function describeReferralStatus(status: string | null): ReferralStatusCopy {
  if (status && status in COPY) return COPY[status as keyof typeof COPY]
  return COPY.pending
}

const COUNTED = new Set(['earned', 'manual_pending', 'applied'])

/** Meses que ya sumó el dueño: pagaron y el premio no fue rechazado ni quedó sobre el tope. */
export function countReferralMonths(
  referrals: ReadonlyArray<{ rewardStatus: string | null }>,
): number {
  return referrals.filter((r) => r.rewardStatus !== null && COUNTED.has(r.rewardStatus)).length
}
