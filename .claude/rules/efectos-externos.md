---
paths:
  - "src/modules/**"
  - "src/server/**"
  - "src/shared/jobs/**"
---

# Efectos externos y transacciones

- Una llamada a MercadoPago, Resend o R2 **NUNCA va adentro de una transacción SQL**. Si la tx aborta después de la llamada, el reintento duplica el efecto externo (pasó: doble reembolso) y encima la conexión queda tomada durante toda la latencia de red. Patrón: preparar en la tx → commitear → llamar afuera → registrar el resultado en una segunda tx (Saga).
- Al revés también: no commitear una escritura local dando por hecho que el efecto externo salió bien (pasó: alta de staff commiteada con el email de invitación fallado).
- **Un `try/catch` agregado a un middleware que compone DENTRO de `withTenantContext`/`withPlayerContext` convierte un throw en un valor resuelto, y `db.transaction` hace COMMIT en vez de ROLLBACK** aunque el handler haya fallado a mitad de una escritura multi-paso — sin ningún cambio visible en la respuesta al cliente, así que no lo delata ningún test que solo mire el body HTTP. El catch de "loguear + devolver `internal()`" solo es seguro en la capa que envuelve la llamada a `withTenantContext(...)` DESDE AFUERA (ahí el rollback de Drizzle ya corrió antes de que la excepción llegue al catch) — nunca en una capa intermedia que corre adentro de esa tx (`with-role.ts` es justo eso: compone siempre dentro de `withTenant`). Antes de agregar un catch a cualquier wrapper de `src/server/middleware/`, verificar con `grep -n "withTenantContext\|withPlayerContext" src/server/middleware/*.ts` cuál de los dos lados de la tx es. (pasó: 2026-09-02, ver `docs/gtm/ejecucion/10-aprendizajes.md` — un fix de mensajes de error le agregó try/catch a los 4 wrappers por igual; un revisor adversarial de contexto fresco lo agarró antes de mergear, corrigiéndolo solo en `with-role.ts`.)
