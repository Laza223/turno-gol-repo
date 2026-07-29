// Fixture de turnogol-jsonb-stringify-en-sql.
// Violaciones a propósito — ver .semgrepignore.

declare const sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown
declare const tx: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
declare const settings: Record<string, unknown>
declare const tenantId: string

// ruleid: turnogol-jsonb-stringify-en-sql
export const malSql = () => sql`UPDATE tenants SET settings = ${JSON.stringify(settings)} WHERE id = ${tenantId}`

// ruleid: turnogol-jsonb-stringify-en-sql
export const malTx = () => tx`UPDATE tenants SET settings = ${JSON.stringify(settings)} WHERE id = ${tenantId}`

// ok: turnogol-jsonb-stringify-en-sql
// El objeto crudo: postgres-js lo serializa UNA vez, que es lo correcto.
export const bien = () => sql`UPDATE tenants SET settings = ${settings} WHERE id = ${tenantId}`

// ok: turnogol-jsonb-stringify-en-sql
// JSON.stringify fuera de un template SQL no tiene nada de malo.
export const bienFueraDeSql = () => JSON.stringify(settings)
