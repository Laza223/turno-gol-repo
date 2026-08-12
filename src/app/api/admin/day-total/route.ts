import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { withAnyRole } from '@/server/middleware/with-role'
import { guard } from '@/shared/rate-limit/route-guard'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import { resolveCutoffMins } from '@/modules/tenants/tenant-operating-day'
import { operatingDateOf } from '@/shared/time/operating-day'

export const dynamic = 'force-dynamic'

/**
 * B14 — lo cobrado HOY por el complejo que llama, para el "Hoy: $X" del sidebar
 * (visión v2 §3.3 / P2: el número acompaña en la barra, visible desde cualquier
 * espacio).
 *
 * **Por qué un endpoint y no un prop del layout.** El número podría salir de
 * `(admin)/layout.tsx`, que ya corre server-side por request. Pero un layout de
 * Next no se vuelve a renderizar al navegar entre rutas hermanas con `<Link>`, y
 * —más importante— la plata entra desde AFUERA de esta pestaña: una seña que
 * confirma el webhook de MercadoPago, otro empleado cobrando desde su teléfono.
 * Un número que solo se refresca cuando re-renderiza el layout envejece sin
 * avisar, y un total de plata viejo se lee como plata que falta. Por eso el dato
 * tiene su propio camino de refresco.
 *
 * **Nivel operador (admin + manager), igual que `/api/admin/metrics`.** No es
 * una exposición nueva: `/caja` no tiene gate de rol más allá de "es staff", así
 * que el encargado ya ve exactamente este número. La decisión v2 D5 dejó la
 * PANTALLA "Hoy" solo para el admin (métricas del negocio: comparación contra la
 * semana pasada, ocupación); lo cobrado del día que el encargado opera nunca
 * estuvo de ese lado de la línea.
 *
 * La fecha y el cutoff se calculan SERVER-SIDE desde `tenants`: el día operativo
 * de un complejo que cierra pasada la medianoche no es el día calendario, y un
 * parámetro del cliente que decide sobre qué ventana se suma plata es un
 * parámetro que se puede pisar.
 */
export const GET = withTenant(
  withAnyRole(['admin', 'manager'], async (_req: NextRequest, user, tx) => {
    const throttled = await guard('adminDayTotal', user.tenantId!)
    if (throttled) return throttled

    const cutoffMins = await resolveCutoffMins(user.tenantId!, tx)
    const date = operatingDateOf(new Date(), cutoffMins)
    // getDaySummary y no una query propia: una segunda implementación del mismo
    // agregado es exactamente lo que el criterio de Fase 1 prohíbe.
    const summary = await getDaySummary(user.tenantId!, date, cutoffMins, tx)

    return NextResponse.json({ data: { date, collectedCents: summary.collected } })
  }),
)
