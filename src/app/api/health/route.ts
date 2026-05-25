// Alias of /api/status. doc17 (observability) and doc19 (runbook) reference
// /api/health for the external uptime monitor; /api/status predates them.
// Same contract, same handler — re-exported to avoid drift.
export { GET, dynamic, runtime } from '../status/route'
