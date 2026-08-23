import { requireAdminStaff } from '@/modules/staff/guards'
import { PerfilImagesForm } from './PerfilImagesForm'
import { AccountEmailForm } from './AccountEmailForm'
import { TenantContactForm } from './TenantContactForm'
import {
  setTenantImageAction,
  removeTenantImageAction,
  updateUserEmailAction,
  updateTenantContactAction,
} from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function PerfilPage() {
  const { user, tenant } = await requireAdminStaff()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <SettingsTabs active="/settings/perfil" />

      <AccountEmailForm currentEmail={user.email} updateEmailAction={updateUserEmailAction} />

      <TenantContactForm
        currentPhone={tenant.phone}
        currentEmail={tenant.email}
        currentWhatsapp={tenant.whatsapp}
        action={updateTenantContactAction}
      />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Perfil público</h2>
        <PerfilImagesForm
          logoUrl={tenant.logoUrl}
          coverUrl={tenant.coverUrl}
          setImageAction={setTenantImageAction}
          removeImageAction={removeTenantImageAction}
        />
      </div>
    </div>
  )
}
