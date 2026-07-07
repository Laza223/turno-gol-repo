import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PerfilImagesForm } from './PerfilImagesForm'
import { SettingsTabs } from '../SettingsTabs'

export default async function PerfilPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <SettingsTabs active="/settings/perfil" />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Perfil público</h2>
        <PerfilImagesForm logoUrl={tenant.logoUrl} coverUrl={tenant.coverUrl} />
      </div>
    </div>
  )
}
