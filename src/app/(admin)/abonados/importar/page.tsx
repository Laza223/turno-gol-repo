import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import {
  IMPORT_TEMPLATE,
  MAX_IMPORT_ROWS,
  serializeTable,
} from '@/modules/abonados/abonado-import.parse'
import { PageHeader } from '@/components/admin/PageHeader'
import { BackLink } from '@/components/admin/BackLink'
import { ImportarFijosForm } from './ImportarFijosForm'
import { importAbonadosAction, previewAbonadoImportAction } from './actions'

export default async function ImportarFijosPage() {
  const auth = await requireOperatorStaff({ allowReadOnly: true })
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  // La plantilla se arma acá y viaja como texto: el parser no entra al bundle
  // del navegador.
  const [header, ...example] = IMPORT_TEMPLATE

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        variant="plain"
        title="Importar turnos fijos"
        subtitle="Cargá de una vez los fijos que hoy tenés en una planilla."
        back={<BackLink href="/abonados">Volver a Turnos fijos</BackLink>}
      />
      <ImportarFijosForm
        courtNames={courts.map((c) => c.name)}
        templateTsv={serializeTable(header, example)}
        templateCsv={serializeTable(header, example, ';')}
        maxRows={MAX_IMPORT_ROWS}
        previewAction={previewAbonadoImportAction}
        importAction={importAbonadosAction}
      />
    </div>
  )
}
