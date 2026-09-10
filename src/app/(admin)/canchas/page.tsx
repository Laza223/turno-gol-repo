import { requireAdminStaff } from '@/modules/staff/guards'
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

export default async function CanchasPage() {
  // Canchas salió de Configuración el 2026-09-10 y es un espacio propio del
  // menú, así que ya NO hereda el guard del layout de settings: este
  // requireAdminStaff es el gate real, no una redundancia. Sigue siendo
  // solo del dueño, igual que cuando vivía adentro de Configuración.
  const { tenant } = await requireAdminStaff()

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))

  return (
    <div className="space-y-6">
      <div className="card-entrance">
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
