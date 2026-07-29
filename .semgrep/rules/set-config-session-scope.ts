// Fixture de turnogol-set-config-session-scope.
// Contiene violaciones A PROPÓSITO: está en .semgrepignore para que el scan
// del repo no lo reporte, y en tsconfig.exclude para que tsc no lo compile.

declare const tx: {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  unsafe: (q: string) => Promise<unknown>
}
declare const tenantId: string
declare const role: string

// ruleid: turnogol-set-config-session-scope
export const malSinTercerArg = () => tx`SELECT set_config('app.current_tenant_id', ${tenantId})`

// ruleid: turnogol-set-config-session-scope
export const malConFalse = () => tx`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`

// ruleid: turnogol-set-config-session-scope
export const malSetRoleSinLocal = () => tx.unsafe(`SET ROLE ${role}`)

// ruleid: turnogol-set-config-session-scope
export const malSetGucSinLocal = () => tx.unsafe(`SET app.current_tenant_id = '${tenantId}'`)

// ok: turnogol-set-config-session-scope
export const bienConTrue = () => tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`

// ok: turnogol-set-config-session-scope
export const bienSetLocalRole = () => tx.unsafe(`SET LOCAL ROLE ${role}`)

declare const claims: Record<string, unknown>

// ok: turnogol-set-config-session-scope
// Regresión: con un `)` anidado adentro de los argumentos, el pattern-not tiene
// que seguir viendo el `, true)` del final. Ver client.ts:268.
export const bienConParenAnidado = () => tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`

// ruleid: turnogol-set-config-session-scope
export const malConParenAnidado = () => tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)})`
