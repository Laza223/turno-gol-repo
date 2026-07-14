// Alias of /api/status. doc17 (observability) and doc19 (runbook) reference
// /api/health for the external uptime monitor; /api/status predates them.
// Same contract, same handler — re-exported to avoid drift.
//
// `dynamic` y `runtime` van declarados acá, NO re-exportados desde ../status/route:
// Next 16 exige que el route segment config sea estáticamente parseable en el
// archivo, y un re-export rompe el build ("can't recognize the exported `dynamic`
// field in route. It mustn't be reexported"). Tienen que quedar en sync con
// ../status/route.ts a mano.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export { GET } from '../status/route'
