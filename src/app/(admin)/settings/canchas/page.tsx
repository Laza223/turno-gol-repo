import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { CourtList } from '@/app/(admin)/settings/canchas/components/CourtList'
import {
  createCourtAction,
  updateCourtAction,
  toggleCourtStatusAction,
  getCourtDeactivationImpactAction,
  uploadCourtPhotoAction,
  removeCourtPhotoAction,
  reorderCourtPhotosAction,
} from '@/app/(admin)/settings/canchas/actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function SettingsCanchasPage() {
  // Configuración entera es solo del dueño y el gate real vive en el layout
  // (settings/layout.tsx). Acá decía requireOperatorStaff, que nunca llegaba a
  // correr: leerlo hacía concluir que el encargado entraba a Canchas, y la
  // auditoría de coherencia se comió esa premisa falsa dos veces (H163).
  const { tenant } = await requireAdminStaff()

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))

  return (
    <div className="space-y-6">
      <div className="card-entrance">
        <SettingsTabs active="/settings/canchas" />
      </div>
      <div className="card-entrance" style={{ animationDelay: '120ms' }}>
        <CourtList
          initialCourts={courts}
          tenantId={tenant.id}
          openingHours={tenant.openingHours}
          closesNextDay={tenant.closesNextDay}
          isAdmin
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
