import { requireAdminStaff } from '@/modules/staff/guards'
import { listMyReferrals } from '@/modules/referrals/referral.service'
import { countReferralMonths } from '@/modules/referrals/referral-reward.service'
import { absoluteUrl } from '@/lib/seo/metadata'
import { REFERRAL_PROMO_ENDS_AT } from '@/shared/constants'
import { getTenantReferralCode } from '../../dashboard/queries'
import { SettingsHeader } from '../SettingsHeader'
import { ReferralPanel } from './ReferralPanel'
import { generateReferralLinkAction } from './actions'

/** Link de referidos y lista de invitados (solo dueño: el layout ya exige admin). */
export default async function InvitarSettingsPage() {
  const { tenant } = await requireAdminStaff({ allowReadOnly: true })
  const [code, referrals, months] = await Promise.all([
    getTenantReferralCode(tenant.id),
    listMyReferrals(tenant.id),
    countReferralMonths(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <SettingsHeader title="Invitá otro complejo" />
      <ReferralPanel
        url={code ? absoluteUrl(`/r/${code}`) : null}
        tenantName={tenant.name}
        promoOpen={new Date().getTime() <= REFERRAL_PROMO_ENDS_AT.getTime()}
        referrals={referrals}
        months={months}
        generateAction={generateReferralLinkAction}
      />
    </div>
  )
}
