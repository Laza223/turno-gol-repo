import { requireAdminStaff } from '@/modules/staff/guards'
import { listMyReferrals } from '@/modules/referrals/referral.service'
import { absoluteUrl } from '@/lib/seo/metadata'
import { REFERRAL_PROMO_ENDS_AT } from '@/shared/constants'
import { getTenantReferralCode } from '../../dashboard/queries'
import { SettingsHeader } from '../SettingsHeader'
import { ReferralPanel } from './ReferralPanel'
import { generateReferralLinkAction } from './actions'

/** Link de referidos y lista de invitados (solo dueño: el layout ya exige admin). */
export default async function InvitarSettingsPage() {
  const { tenant } = await requireAdminStaff()
  const [code, referrals] = await Promise.all([
    getTenantReferralCode(tenant.id),
    listMyReferrals(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <SettingsHeader title="Invitá otro complejo" />
      <ReferralPanel
        url={code ? absoluteUrl(`/r/${code}`) : null}
        tenantName={tenant.name}
        promoOpen={new Date().getTime() <= REFERRAL_PROMO_ENDS_AT.getTime()}
        referrals={referrals}
        generateAction={generateReferralLinkAction}
      />
    </div>
  )
}
