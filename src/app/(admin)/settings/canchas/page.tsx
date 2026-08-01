import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { CourtList } from '@/app/(admin)/canchas/components/CourtList'
import {
  createCourtAction,
  updateCourtAction,
  toggleCourtStatusAction,
  getCourtDeactivationImpactAction,
  uploadCourtPhotoAction,
  removeCourtPhotoAction,
  reorderCourtPhotosAction,
} from '@/app/(admin)/canchas/actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function SettingsCanchasPage() {
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant, role } = auth

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))

  return (
    <div className="space-y-6">
      <div className="card-entrance">
        <SettingsTabs active="/settings/canchas" />
      </div>
      <div className="card-entrance" style={{ animationDelay: '120ms' }}>
        <CourtList
          initialCourts={courts}
          openingHours={tenant.openingHours}
          isAdmin={role === 'admin'}
          tenantName={tenant.name}
          toggleStatusAction={toggleCourtStatusAction}
          getDeactivationImpactAction={getCourtDeactivationImpactAction}
          createAction={createCourtAction}
          updateAction={updateCourtAction}
          uploadPhotoAction={uploadCourtPhotoAction}
          removePhotoAction={removeCourtPhotoAction}
          reorderPhotosAction={reorderCourtPhotosAction}
        />
      </div>
    </div>
  )
}
