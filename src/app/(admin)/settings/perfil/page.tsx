import { Building2, ExternalLink } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { PageHeader } from '@/components/admin/PageHeader'
import { PerfilImagesForm } from './PerfilImagesForm'
import { AccountEmailForm } from './AccountEmailForm'
import { TenantContactForm } from './TenantContactForm'
import { TenantLocationForm } from './TenantLocationForm'
import {
  setTenantImageAction,
  removeTenantImageAction,
  updateUserEmailAction,
  updateTenantContactAction,
  updateTenantLocationAction,
} from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function PerfilPage() {
  const { user, tenant } = await requireAdminStaff()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil"
        subtitle="Datos de tu cuenta y del complejo que ven los jugadores."
        icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
      />

      <SettingsTabs active="/settings/perfil" />

      <AccountEmailForm currentEmail={user.email} updateEmailAction={updateUserEmailAction} />

      {/* H069: movida arriba de Contacto/Ubicación — es lo primero que la
          tarea C4 (subir logo y portada) necesita, y en mobile quedaba
          debajo de dos secciones enteras, incluido un mapa interactivo. */}
      <div className="card-premium rounded-lg p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Perfil público</h2>
          {/* H067: sin este link no había forma de verificar cómo quedaron
              el logo y la portada en el perfil público real. */}
          <a
            href={`/${tenant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver mi perfil público
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
        <PerfilImagesForm
          logoUrl={tenant.logoUrl}
          coverUrl={tenant.coverUrl}
          setImageAction={setTenantImageAction}
          removeImageAction={removeTenantImageAction}
        />
      </div>

      <TenantContactForm
        currentPhone={tenant.phone}
        currentEmail={tenant.email}
        currentWhatsapp={tenant.whatsapp}
        action={updateTenantContactAction}
      />

      <TenantLocationForm
        currentAddress={tenant.address}
        currentCity={tenant.city}
        currentProvince={tenant.province}
        currentLatitude={tenant.latitude}
        currentLongitude={tenant.longitude}
        action={updateTenantLocationAction}
      />
    </div>
  )
}
