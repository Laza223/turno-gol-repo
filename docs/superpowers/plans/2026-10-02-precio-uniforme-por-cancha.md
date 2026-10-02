# Precio uniforme de $30.000 por cancha — plan de implementación

> **Para ejecución:** aplicar `protocolo-orquestacion` y `superpowers:executing-plans`; implementación y revisión independiente deben ser invocaciones distintas. El proyecto exige verificadores Sonnet; si el harness no ofrece ese modelo, informar la limitación antes de ejecutar, sin sustituirlo silenciosamente. Este documento planifica; no autoriza un merge ni cambios de producción.

**Objetivo:** cobrar $30.000 ARS por cancha facturada por mes, incluida la primera, a suscripciones nuevas y existentes desde su próximo cobro, preservando pruebas y períodos pagados.

**Arquitectura:** conservar el modelo de catálogo y la fórmula existentes. Igualar los dos parámetros de precio en `plans`, registrar la versión histórica y actualizar los preapprovals de MercadoPago mediante el gateway existente. No hace falta cambiar tablas, columnas, contratos de billing ni el cálculo de cantidad de canchas.

**Stack:** TypeScript, Next.js, PostgreSQL/Supabase, MercadoPago Suscripciones, Vitest y Storybook.

**Spec y autorización:** pedido escrito de Lazar del 2026-10-02: “30k por cancha, no que la primer o una cancha sea 47k”; respuesta posterior: “Sí, nuevas y existentes desde el próximo cobro”. Antecedente: `docs/decisions/2026-09-17-precio-por-cancha.md`; el pedido supera su P1 y la protección de montos anteriores de P5 para esta baja. P2/P3/P4/P7 siguen vigentes. P6 queda superada: el dueño confirmó publicar esta lista en `/precios`. Autorizó verificadores GPT independientes como excepción a Sonnet para este esfuerzo.

## Restricciones y resultado esperado

- Valores en centavos ARS: `price_first_court_cents = 3_000_000`, `price_extra_court_cents = 3_000_000`.
- Conservar `annual_discount_bps = 1000`: anual con 10% de descuento. No se solicitó cambiarlo.
- Conservar una sola fila activa, `slug = 'turnogol'`, `max_courts IS NULL`.
- Usar `billed_courts`, nunca reemplazarlo por el conteo de canchas online. Conservar cambios de cantidad pendientes y su fecha de aplicación.
- No prorratear, devolver pagos previos, adelantar cobros, cancelar/recrear una suscripción autorizada ni modificar el trial o el período local.
- No activar `price_locked_until`, tocar señas, OAuth de clientes, cobros de reservas, lifecycle, referidos, IVA ni descuentos adicionales.
- No editar migraciones existentes ni ejecutar `db:push`, `db:migrate` o `db:sync-supabase`. Copiar solamente el nuevo espejo a mano.
- No borrar código ni cambiar estructura sin autorización. No hacer commit/push/merge sin pedido explícito.
- Preservar cambios ajenos en el working tree, incluidos `docs/gtm/ejecucion/10-aprendizajes.md` y los archivos no trackeados.

| Canchas facturadas |  Mensual | Equivalente mensual anual | Cobro anual |
| -----------------: | -------: | ------------------------: | ----------: |
|                  1 |  $30.000 |                   $27.000 |    $324.000 |
|                  2 |  $60.000 |                   $54.000 |    $648.000 |
|                  3 |  $90.000 |                   $81.000 |    $972.000 |
|                  5 | $150.000 |                  $135.000 |  $1.620.000 |
|                  8 | $240.000 |                  $216.000 |  $2.592.000 |
|                 12 | $360.000 |                  $324.000 |  $3.888.000 |

Respecto de la lista anterior, la reducción es $17.000 por mes por complejo para cualquier cantidad fija de canchas; en anual son $183.600 menos por cobro anual. Un año ya pagado conserva su período; la tarifa nueva se usa en su próxima renovación.

## Evidencia del código inspeccionado

| Fuente                                                                               | Comportamiento comprobado                                                     | Consecuencia                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/modules/billing/pricing.ts`, `monthlyListAmount`                                | Primera + (N − 1) × extra, recibe los precios como parámetros                 | Con ambos a $30.000 ya calcula N × $30.000; conservar fórmula e interfaces                       |
| `src/modules/billing/billing.service.ts`, `loadActivePlan`, `subscriptionAmount`     | Lee precios de DB y usa la función pura                                       | Cambiar un comentario o una constante de un test no cambia los cobros reales                     |
| `src/modules/payments/mp-gateway.implementation.ts`, `updatePreapprovalAmount`       | GET previo y PUT con frecuencia, moneda y fechas conservadas                  | Reutilizarlo; proteger con tests de baja, no reimplementar la API                                |
| `src/shared/jobs/workers/reconcile-subscriptions.worker.ts`, `checkAmountDrift`      | Compara catálogo y monto remoto, avisa, no corrige                            | No confiar en el cron para actualizar las suscripciones existentes                               |
| `src/shared/jobs/workers/dunning-retry.worker.ts`                                    | Al aplicar una cantidad pendiente vuelve a calcular con el catálogo           | Durante la transición puede escribir un monto; controlar concurrencia y no consumir el pendiente |
| `src/modules/billing/billing.service.ts`, `reusablePendingCheckout`                  | Solo reusa un checkout si el monto coincide                                   | Cubrir links pendientes anteriores a la baja, incluidos los que quedaron vivos deliberadamente   |
| `src/modules/super-admin/dashboard.service.ts`                                       | MRR calculado con los mismos parámetros del catálogo                          | Verificar MRR mensual y equivalente anual sin cambiar la fórmula                                 |
| `src/shared/db/schema/price-versions.ts` y migraciones 043/071/090                   | Historial de reglas; precedentes cierran `valid_until` e insertan una versión | No reescribir importes históricos; cerrar vigencia e insertar una versión nueva                  |
| `.github/workflows/db-migrate.yml`                                                   | Un push a main con cambios en el espejo aplica migraciones a producción       | La aplicación de la baja debe coordinarse ANTES del merge                                        |
| `src/app/(business)/precios/plans-data.ts`, `tests/integration/pricing-sync.test.ts` | Tres bandas comerciales viejas y 20% anual, divergencia deliberada            | No cambiar la web en silencio; resolver P6 con la respuesta del dueño                            |

Drift documental: AGENTS.md menciona `.Codex/rules/`, pero en este checkout las reglas verificadas están en `.claude/rules/`. La decisión anterior menciona una salvaguarda en la migración 088; el guard real del flip está en 091. Usar los archivos reales, sin modificar el núcleo instalado a mano.

## Riesgos que deben tener un test o una comprobación real

1. Actualizar solo DB muestra $30.000 pero deja a MP cobrando el monto anterior.
2. Un PUT incompleto pierde `start_date` y puede cobrar antes del fin de la prueba.
3. Confundir centavos con pesos, o equivalente anual con total, multiplica/divide el cobro por 100 o por 12.
4. Cambios pendientes, altas o reactivaciones concurrentes pueden dejar otra cantidad o un preapproval nuevo fuera del inventario.
5. Un timeout después de un PUT exitoso no prueba fracaso; hay que releer MP antes de reintentar. Links pendientes huérfanos pueden autorizarse después de la baja.

## Tarea 1 — Relevar producción y fijar la fecha de aplicación

**Fuentes:** `tenant_subscriptions`, `plans`, `price_versions`, `tenants.trial_ends_at`, auditoría de checkout y preapprovals de la cuenta master. Ningún dato actual de producción fue consultado durante esta planificación.

**Documentos a crear al ejecutar:** `docs/decisions/2026-10-02-precio-uniforme-por-cancha.md` y `docs/operations/2026-10-02-baja-precio-saas.md`.

- [ ] Registrar la decisión escrita, anual 10% conservado, nuevas/existentes y próximo cobro. Registrar el pedido en `docs/gtm/ejecucion/10-aprendizajes.md` sin inventar ventas perdidas u observaciones de clientes.
- [ ] Obtener inventario de TODAS las suscripciones: tenant, estado, plan, ciclo, `billed_courts`, id MP, períodos, trial y pendientes. No usar el estado de septiembre ni un `.env.production` local como prueba del entorno actual.
- [ ] Leer MP con la cuenta de Suscripciones de TurnoGol. Comparar `external_reference`, estado remoto, importe, frecuencia, `start_date` y `next_payment_date`. Verificar la moneda ARS. No usar tokens OAuth de señas ni mostrar secretos.
- [ ] Buscar también preapprovals pendientes vivos que ya no sean el id actual, mediante la búsqueda de MP y `leftPendingMpSubscriptionId` en auditoría. Distinguir los huérfanos de las suscripciones vigentes; no actualizar/cancelar automáticamente autorizados huérfanos ni terminales locales.
- [ ] Preparar un manifiesto por suscripción vigente: monto remoto previo, monto nuevo, fechas y estado local/remoto. Los importes nuevos se calculan con parámetros explícitos de $30.000, no con el catálogo viejo.
- [ ] Si un importe remoto ya es menor que la nueva lista, una frecuencia no coincide, falta vínculo al tenant, hay un `price_locked_until` vigente o aparece una suscripción viva huérfana, detener ese caso y presentarlo al dueño. La autorización es una baja, no un aumento accidental ni reactivación.
- [ ] Determinar una ventana anterior a los próximos cobros, sin cargos ya emitidos/reintentos anteriores pendientes. Un cargo ya generado por MP puede conservar el importe viejo: consultar esos casos antes de prometer el siguiente débito a precio nuevo. No alterar deudas/cargos anteriores sin una decisión adicional.
- [ ] Probar en entorno de prueba que bajar un preapproval autorizado y otro pendiente conserva frecuencia y fechas y no genera un cargo inmediato. El SDK mockeado no sustituye esta comprobación del proveedor.

Consulta de inventario local/cross-tenant a ejecutar con acceso administrativo controlado, sin seleccionar credenciales:

```sql
SELECT ts.tenant_id, ts.status, ts.plan_id, ts.billing_cycle,
       ts.billed_courts, ts.mp_subscription_id,
       ts.current_period_start, ts.current_period_end,
       ts.pending_billed_courts, ts.pending_change_at,
       ts.price_locked_until, t.trial_ends_at,
       p.slug, p.price_first_court_cents,
       p.price_extra_court_cents, p.annual_discount_bps
FROM tenant_subscriptions ts
JOIN tenants t ON t.id = ts.tenant_id
JOIN plans p ON p.id = ts.plan_id
ORDER BY ts.tenant_id;
```

**Entregable:** inventario y manifiesto revisables, con cero casos inexplicados en el conjunto que se va a actualizar. La fecha de la versión debe ser la fecha operativa acordada para el corte, no asumir que el plan se ejecuta el 2 de octubre.

## Tarea 2 — Preparar la baja del catálogo y fijar los importes con tests

**Crear:** siguiente migración libre `NNN_precio_uniforme_por_cancha.sql` y su espejo `20260424NNNNNN_precio_uniforme_por_cancha.sql`. El último archivo observado hoy es 094; releer antes de elegir el número. Crear `tests/integration/precio-uniforme-migration.test.ts`.

**Modificar:** `tests/integration/pricing-sync.test.ts`, `tests/unit/pricing-por-cancha.test.ts`; comentarios vigentes en `src/modules/billing/pricing.ts`.

- [x] Agregar expectativas explícitas contra la DB y verlas fallar antes de la migración. Importes en centavos: 1 → 3.000.000, 2 → 6.000.000, 3 → 9.000.000, 5 → 15.000.000, 8 → 24.000.000, 12 → 36.000.000. Anual una cancha → 32.400.000, cinco → 162.000.000.
- [x] Mantener tests de la fórmula con parámetros distintos para demostrar que sigue siendo parametrizada; no reemplazar indiscriminadamente todos los fixtures de $47.000 ni pagos históricos de otras pruebas.
- [x] Escribir migración transaccional, de DATOS: exigir exactamente una activa `turnogol`, sin techo y con los parámetros anteriores esperados o los nuevos ya aplicados. Abortar ante otro estado en vez de sobreescribir decisiones ajenas.
- [x] Cambiar primera y extra a 3.000.000; conservar 1000 bps. Alinear referencias `price_monthly = 3_000_000` y `price_annual = 2_700_000` (equivalente mensual, no total anual).
- [x] Cerrar solo `valid_until` de la versión previa e insertar la nueva regla con motivo y fecha de corte. Preservar valores históricos y FK. Reejecutar no debe generar versiones duplicadas ni cerrar la versión nueva.
- [x] La migración no toca `tenant_subscriptions`, `tenants`, cobros históricos ni MP. Comprobar snapshots antes/después de suscripciones con mensual/anual, trial y cambio de canchas pendiente.
- [x] Probar forward sobre datos existentes, idempotencia con dos aplicaciones y recuperación del catálogo en copia local. Copiar a mano únicamente el espejo nuevo y correr `migrations-mirror-sync.test.ts`.

Caso unit mínimo, usando los imports existentes del test:

```ts
it.each([
  [1, 3_000_000, 32_400_000],
  [2, 6_000_000, 64_800_000],
  [5, 15_000_000, 162_000_000],
  [12, 36_000_000, 388_800_000],
])('precio uniforme para %i canchas', (billedCourts, monthly, annual) => {
  const params = {
    priceFirstCourtCents: 3_000_000,
    priceExtraCourtCents: 3_000_000,
    annualDiscountBps: 1000,
  }
  expect(monthlyListAmount(billedCourts, params)).toBe(monthly)
  expect(computeSubscriptionAmount({ ...params, billedCourts, cycle: 'annual' })).toBe(annual)
})
```

**Entregable:** catálogo e historial probados, sin cambios de schema ni de fórmula.

## Tarea 3 — Preparar la actualización recuperable de MP

**Crear:** `scripts/billing/reprice-subscriptions.ts` y `tests/unit/reprice-subscriptions.test.ts`. Módulo importable sin ejecutar el CLI al importar. No agregar un job recurrente ni una nueva funcionalidad de producto.

**Reutilizar:** `getBillingGateway()`, `getSubscriptionState()`, `updatePreapprovalAmount()`, `computeSubscriptionAmount()` y auditoría existente.

- [x] El script es read-only por defecto: inventario/manifiesto y simulación. Aplicación solo con `--apply --manifest <archivo>` explícitos; el manifiesto contiene ids y precios, nunca credenciales. Las rutas son argumentos, no URLs o tokens de producción hardcodeados.
- [x] Antes de cada PUT, releer la suscripción local y el estado remoto; exigir mismo id, tenant, ciclo, canchas, pendientes y fechas que el manifiesto. Procesar secuencialmente y detener el lote ante error o cambio concurrente.
- [x] Si MP ya tiene el importe nuevo con los demás campos intactos, hacer no-op. Si tiene el importe anterior esperado, bajar usando el gateway existente. Ante otro importe/estado, no improvisar una corrección.
- [x] El PUT se hace fuera de una transacción SQL. Después hacer un GET y exigir importe nuevo, misma frecuencia, fechas, tenant y estado. Registrar resultado en auditoría; si falla la escritura de auditoría, conservar evidencia operativa y permitir retomar mediante GET, sin volver a cobrar ni crear preapprovals.
- [ ] Actualizar vigentes `authorized` y `pending` compatibles. `paused`, `cancelled`, referencia ajena, 404, estado desconocido o remoto sin monto verificable se clasifican y frenan si impiden completar el conjunto; no se reactivan.
- [ ] Ajustar por separado pendientes huérfanos propios y nunca cobrados SOLO si se pudo verificar inequívocamente su cantidad y ciclo. De lo contrario elevar esos links al dueño: no dejarlos capaces de cobrar tarifa vieja sin informar, ni cancelar indiscriminadamente.
- [x] Tests de dry-run sin PUT, mensual/anual, trial intacto, reejecución no-op, fallo antes del PUT, timeout después de éxito remoto, GET de verificación distinto, cambio concurrente y rechazo de aumento/referencia ajena. Para timeout simular “PUT aplicó pero respondió error”; la segunda ejecución debe leer el importe nuevo y no repetir la escritura.
- [x] Agregar al test existente `tests/unit/mp-update-preapproval-amount.test.ts` la baja de 16.700.000 a 15.000.000 centavos y el anual de 162.000.000, preservando campos y conversión a pesos. Conservar el caso previo de preservación de `end_date`.
- [x] Cubrir en `tests/unit/billing-checkout-reuse.test.ts` un checkout viejo a 7.700.000 frente al nuevo de dos canchas a 6.000.000; cubrir el pendiente ya ajustado, que sí se reusa. Mantener las protecciones de cobros huérfanos.

**Entregable:** simulación revisable y aplicación retomable por suscripción, sin tocar estado, períodos, canchas ni preferencias de señas.

## Tarea 4 — Alinear panel, pruebas y documentación vigente

**Fuentes/UI:** `src/app/(admin)/settings/facturacion/PriceBreakdown.tsx`, `CuotaSection.tsx`, sus stories, `src/app/(public)/reactivar/page.tsx`, `src/app/(admin)/canchas/billing-copy.ts`, detalle SuperAdmin y `src/test/fixtures/super-admin.ts`.

**Tests:** `cuota-section.test.tsx`, `facturacion-page.test.tsx`, `reactivar-page.test.tsx`, `billing-change-billed-courts.test.ts`, `billing-subscribe-billed-courts-floor.test.ts`, `billing-reactivate-recovery-states.test.ts`, `dunning-retry-downgrade-mp-update.test.ts`, `reconcile-subscriptions-worker.test.ts`, integración `billing.test.ts` y `super-admin-support.test.ts`.

- [x] Verificar que todos leen el catálogo nuevo. Mostrar el desglose correcto de primera y extras a $30.000. No hace falta cambiar la estructura de `PriceBreakdown`; una simplificación visual es opcional y fuera de este corte delicado.
- [x] Actualizar stories y fixtures que representan la LISTA VIGENTE; conservar fixtures arbitrarios/legacy que prueban parametrización. Agregar expectativas fijas para alta, reactivación, cambio de canchas y baja programada con catálogo uniforme.
- [x] Verificar MRR: cinco canchas mensual = 15.000.000 centavos; anual equivalente = 13.500.000, nunca 162.000.000. No convertir una prueba de selección de pool en un test ficticio del SQL; comprobar la agregación real en integración.
- [ ] Recorrer la app real: cuota mensual/anual, activar durante trial, reactivar y confirmación al agregar cancha. Verificar que el precio coincide con lo enviado al mock MP y que las fechas no cambian.
- [x] Actualizar secciones vigentes de `docs/spec/doc4_monetizacion.md`, `doc6_entidades.md`, `doc11_adrs.md`, `doc13_database_schema.md` y `.claude/rules/billing-precio.md`. Señalar en la decisión anterior que P1/P5 quedan superados, preservando su contenido histórico. El AGENTS.md instalado se actualiza por su fuente canónica/`install.ps1`, no a mano.
- [x] Barrido final de $47.000/$77.000/$107.000/$167.000 y valores en centavos: clasificar cada aparición como historia, fixture parametrizado o referencia vigente. No hacer replace global sobre migraciones, reservas o caja.

**Presupuesto inicial:** hasta 35 archivos entre runtime, script, migraciones, tests, stories y documentos vigentes; hasta aproximadamente 1.300 líneas de código/tests/SQL nuevas o cambiadas (estimación corregida al medir fixtures, formato y controles operativos del alcance autorizado), documentación aparte. Si requiere nueva infraestructura de precios, locks de producto, tablas o refactor del billing, frenar y revisar alcance.

## Tarea 5 — Publicación comercial autorizada

Resuelto: el dueño confirmó publicar en `/precios` la lista uniforme y anual 10%. P6 queda superada.

- [x] Opción de mantener P6 descartada por la autorización del dueño; se publica la lista uniforme.
- [x] Si autoriza publicar: registrar que P6 queda superado. Inspeccionar `DESIGN.md`, `PRODUCT.md` y la guía local de Next antes de editar TSX; mantener estilo actual y limitar el cambio a comunicación del precio.
- [x] Archivos involucrados en la opción autorizada: `src/app/(business)/precios/{plans-data.ts,PlanSelector.tsx,page.tsx,CalculadoraClavo.tsx}` y sus tres stories; `tests/integration/pricing-sync.test.ts` y un test UI `tests/unit/precios-uniforme.test.tsx`.
- [x] Publicar N × $30.000 con total mensual/anual y 10% vigente, usando las funciones puras existentes. Resolver un número exacto de canchas: `8+` no puede mostrar un total único de una tarifa sin techo. Conservar un selector simple y una cantidad exacta para más de ocho, sin inventar bandas nuevas. Retirar la estructura legacy solo con la autorización explícita de alcance correspondiente.
- [x] Actualizar metadata, calculadora y textos de planes para que no prometan bandas, ilimitadas a precio fijo ni 20% anual. Mantener mensual como presentación inicial según la decisión vigente, sin promocionar anual adicionalmente.
- [x] El candado de integración pasa a verificar coherencia de datos públicos y catálogo real; seguir comparando importes fijos decididos. UI: 1/3/8/12 canchas y ambos ciclos, total anual ×12, teclado y móvil. E2E de esta página se ejecuta explícitamente: no corre en PRs.

## Juez de implementación (inmutable)

Después de cada bloque de código: `pnpm typecheck`. Primero baseline sobre el checkout conservado, después estado final. Registrar comando, código de salida y output real. No usar stash que arrastre trabajo ajeno ni reparar fallas fuera de alcance para dar verde.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm knip
pnpm test
pnpm supabase:start
pnpm test:integration
pnpm test:isolation
pnpm test:isolation:rol-real
```

- [x] Aplicar migraciones solo en DB local antes de integración; `supabase:reset` solo sobre entorno local de prueba que pueda reiniciarse. Ejecutar también el espejo y la doble aplicación.
- [x] Ejecutar stories de cuota/detalle SuperAdmin y, si se incluye web, stories de `/precios`. Ejecutar flujo UI real con `MP_MOCK_MODE=1`, cuidando el dev server reutilizado por Playwright.
- [ ] Revisión adversarial fresca lee diff/código antes del resumen. Verificador de release distinto corre el juez integrado y entrega GO/NO-GO con outputs, incluida evidencia del proveedor en pruebas. No afirmar que mocks demuestran conducta real de MP.

## Corte de producción y recuperación

1. Preparar y revisar todos los archivos, pasar juez local/CI y probar proveedor. Mantener el merge pendiente hasta tener inventario, manifiesto y ventana operativa.
2. Comprobar que se puede detener durante el corte la creación/reactivación y los cambios de canchas facturadas, además del cron que los aplica. Probar el procedimiento operativo antes: no asumir que existe un switch por tenant. Si no puede garantizarse una ventana sin escrituras de billing, definir con el dueño un gate acotado antes de continuar; no agregarlo silenciosamente. Reservas y señas no deben interrumpirse por este trabajo.
3. Releer inventario al iniciar la ventana. Asegurar que no haya cobros inminentes, cargos emitidos/reintentos sin resolver ni procesos de billing en curso. Los webhooks conservan los pagos e importes históricos; coordinar la pausa temporal de escrituras SaaS con entregas pendientes preservadas, según el runbook. El procesamiento de señas no pertenece a esta baja.
4. Actualizar preapprovals verificados con el manifiesto y confirmar por GET cada resultado, respetando las fechas existentes. No cambiar `next_payment_date` para forzar el precio ni mandar montos nuevos a cargos anteriores.
5. Solo con el conjunto conciliado, aplicar la migración del catálogo mediante el circuito autorizado de deploy. El workflow corre al mergear, por eso el orden no puede dejarse para después del merge. Verificar el registro de migraciones y parámetros en la DB real.
6. Releer DB y MP de todos los vigentes, comparando monto, frecuencia, fechas e identidad. Revisar pendientes huérfanos y nuevas altas. Exigir cero desfasajes inexplicados; un warning esperado durante la ventana no se silencia permanentemente.
7. Verificar pantallas reales, MRR y worker con el catálogo nuevo; reanudar escrituras y cron. Los cambios pendientes usan el nuevo precio cuando se apliquen, manteniendo cantidad/fecha confirmadas.
8. Confirmar el primer cobro real posterior: importe, factura, período e idempotencia del webhook. Hasta entonces distinguir “configuración conciliada” de “débito real observado”. No crear cobros de prueba sobre clientes.

No existe una transacción atómica DB + MP. Si MP falla a mitad, detener el lote y conservar los resultados confirmados; no aplicar catálogo mientras queden suscripciones viejas sin resolver. Reanudar por GET + manifiesto y no-op para los ya ajustados. Durante la pausa no anunciar la tarifa como aplicada globalmente.

Preferir completar la baja. Si hay que abortar, la reversión de importes remotos se prepara con los snapshots previos y se verifica en pruebas; requiere revisar si hubo algún cobro o nueva alta a tarifa nueva, porque subirles el precio sería una nueva decisión de negocio. Nunca hacer rollback automático hacia $47.000 ni cancelar suscripciones. Si el catálogo ya fue migrado, cualquier corrección SQL posterior usa una migración nueva, no modifica la aplicada. Restaurar un backup entero no es un rollback admisible de esta baja: borraría movimientos ajenos.

## Estado de esta planificación

- [x] Inspección de fórmula, catálogo, gateway, workers, UI, historial y deploy.
- [x] Confirmación del dueño: nuevas y existentes desde el próximo cobro.
- [x] Spike local: `pnpm exec vitest run tests/unit/pricing-por-cancha.test.ts tests/unit/mp-update-preapproval-amount.test.ts tests/unit/billing-checkout-reuse.test.ts` → `Test Files 3 passed (3)`, `Tests 52 passed (52)`; prueba el comportamiento actual, no la baja implementada.
- [x] Baseline requerido: `pnpm format:check` → `All matched files use Prettier code style!` (exit 0); `pnpm lint` → `eslint src/ tests/ scripts/` (sin diagnósticos, exit 0); `pnpm typecheck` → `tsc --noEmit` (sin diagnósticos, exit 0); `pnpm knip` → `Configuration hints (1): .mdx knip.jsonc Compiled extension excluded by project (imports not followed)` (exit 0). Estos cuatro comandos no validan el Markdown del plan ni un precio nuevo aún no implementado.
- [x] Respuesta sobre `/precios`: publicar la lista uniforme.
- [x] Implementación y revisión independiente de código para preparar PR.
- [ ] Inventario real, prueba del proveedor, ventana de concurrencia, merge/deploy y débito posterior: pendientes antes de aplicar.

La etapa inicial creó el plan sin delegaciones. Durante la implementación se trabajó en el worktree `precio-uniforme`, rama `codex/precio-uniforme-30k`, base `28bdb7ad255e75d79b82be13ace101b6bd09b4c7`. Los tests usan PostgreSQL descartable en 55432 con migraciones 001–095; no se reinició ni migró la DB principal. Las ejecuciones escaladas se aprobaron. La consulta de ampliación por conteo de líneas fue retirada por innecesaria: la estimación corregida cubre el mismo alcance autorizado.

Fuente externa comprobada el 2026-10-02: [MercadoPago, gestión de suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/subscription-management) documenta el cambio de importe de una existente con PUT `/preapproval/{id}`. Esa documentación no prueba por sí sola cuándo cambia un cargo ya emitido: la verificación del proveedor es gate previo al corte.

## Ledger de implementación y verificación

El dueño autorizó expresamente verificadores GPT independientes ante la ausencia de Sonnet. Ningún subagente lanzó otros agentes. Los costos son estimaciones iniciales; el harness no devuelve consumo real por agente.

| Delegación | Finalidad | Costo estimado | Resultado |
| --- | --- | ---: | --- |
| pricing_web | Lista pública, cantidad exacta y stories | 8k tokens | 6 pruebas UI; 25 stories claro y 25 oscuro; 166 adiciones, 7 archivos |
| pricing_operations | Inventario/aplicación MP recuperable y tests SDK | 10k tokens | 36 pruebas, 486 líneas, 3 archivos; sin operaciones reales |
| pricing_review | Revisión adversarial del diff antes de resúmenes | 8k tokens | Aprobado con reservas operativas; juez estático, 4.708 unit y 3 migración propios |
| pricing_ux | Navegación Chromium real, desktop/mobile y CTA | 4k tokens | 61 comprobaciones, 4 combinaciones, issues []; avisos de infraestructura previos |
| pricing_release | Juez final integrado independiente | 7k tokens | GO preparación PR: ocho comandos verdes; NO-GO merge/aplicación por gates operativos |

Se corrigieron fallos de edición detectados por tipos/tests: reemplazo de caracteres por array PowerShell de un solo par, inserción de input y bloque meta de stories. Se restauraron únicamente archivos propios afectados y se repitieron los checks. No hay cambios ajenos incluidos.

Evidencia local de implementación: `pnpm test` → 446 passed / 1 skipped, 4.708 passed / 1 todo; targeted billing/support/pricing/mirror → 85 passed; guard/historial/idempotencia 095 → 3 passed; stories Chromium → 25 passed por tema. El spec público TG-HP-006 → 1 passed, usando el servidor de este worktree en 4000 y configuración temporal que omite el seed autenticado global: es un flujo público sin DB writes.

El inventario real en transacción de solo lectura falló `28P01`; el conector Supabase no está autenticado. Merge y aplicación están bloqueados hasta completar el runbook. `--billing-paused` declara una pausa operativa, no crea un switch. Moneda/end_date no forman parte del estado expuesto por el gateway y se comprueban en el preflight real. El guard SQL exige auditoría vigente con microsegundos antes del flip, sin modificar suscripciones.

Caso de checkout viejo: `billing-checkout-reuse.test.ts` usa primera/extra=3.000.000 y dos canchas=6.000.000, anual=64.800.000. Conserva sus 21 casos; el importe remoto viejo 7.700.000 no se reusa y el ajustado sí. Output targeted: `Test Files 1 passed (1)`, `Tests 21 passed (21)`.

Candidato D-PROYECTO, capturado/verificado el 2026-10-02, sin segundo uso ni promoción: **snapshot-updated-at-microsegundos**. `Date` de JavaScript trunca la precisión de `TIMESTAMPTZ`; comparar auditoría serializada con `updated_at` puede invalidar snapshots iguales. La operación selecciona `to_char(...US...)` como string y el test 095 simula un cambio de un microsegundo. El trigger `set_updated_at` asigna `NOW()` estable durante la transacción: para probar esa diferencia se desactiva únicamente dentro del fixture con rollback en DB descartable. Evidencia: script operativo y `precio-uniforme-migration.test.ts`; tres casos pasaron en ejecución propia e independiente. No se modifica memoria global ni skills.

Verificación MRR con el módulo real `getDashboardData`: fixtures dedicadas de cinco canchas activas agregaron 15.000.000 centavos en mensual y 13.500.000 como equivalente mensual anual. Se eliminaron solo esas dos fixtures.

Diagnóstico de entorno, preservado sin cambiar fuentes: la primera integración completa tuvo 12 fallos de webhooks (`22P02`, UUID vacío). Baseline exacto 28bdb7ad, migraciones001–094 en DB55433: tres archivos/19 casos pasan con mock desactivado y reproducen los mismos 12 fallos con `MP_MOCK_MODE=1`. `session-cookie-chunking.test.ts` carga todo `.env.local` y propaga el flag usado por UI al worker de integración; el gateway local salta los mocks específicos de tests. El archivo privado de este worktree pasó a mock0 luego de completar UI y detener Next4000; el juez íntegro final pasó, sin omitir ni debilitar tests. Baseline se movió fuera del árbol del juez para evitar colectar copias de tests. No se modifica el checkout principal.

Dos intentos unitarios registraron un timeout de 10s en `mp-webhook-rechazo-observable.test.ts`, incluido uno en secuencia. Targeted base y actual pasaron; el mismo caso pasó dentro de la suite base, por lo que no se declara demostrado como fallo preexistente. La última suite actual exacta pasó íntegra sin cambios de código, timeout ni juez. Se conserva esta inestabilidad observada como advertencia y los intentos rojos no cuentan como juez verde.

La navegación real cubrió /precios y su CTA. Los flujos autenticados de facturación se verificaron mediante integración, unitarias y stories; su recorrido real con proveedor sigue pendiente antes del corte, junto con el inventario real. No se presenta esa cobertura como evidencia de un cobro real.

## Juez final independiente y preparación del PR

Veredicto: **GO para preparar PR en borrador; NO-GO para merge/aplicación real** hasta completar el runbook. Base remota `main` comprobada nuevamente: `28bdb7ad255e75d79b82be13ace101b6bd09b4c7`. Son 35 archivos; no hay secretos, entornos ni scratch incluidos.

```text
pnpm format:check
All matched files use Prettier code style!
exit 0

pnpm lint
eslint src/ tests/ scripts/
exit 0, sin diagnósticos

pnpm typecheck
tsc --noEmit
exit 0, sin diagnósticos

pnpm knip
Configuration hints (1)
.mdx knip.jsonc Compiled extension excluded by project (imports not followed)
exit 0

pnpm test
Test Files  446 passed | 1 skipped (447)
Tests       4708 passed | 1 todo (4709)
Duration    124.72s
exit 0

pnpm test:integration
Test Files  155 passed | 1 skipped (156)
Tests       1119 passed | 4 skipped (1123)
Duration    759.94s
exit 0

pnpm test:isolation
Tests       170 passed (170)
exit 0

pnpm test:isolation:rol-real
Tests       157 passed (157)
exit 0
```

Los cuatro casos de sesión GoTrue omitidos son la condición existente sin API de Auth, igual que en CI. Los escenarios de precio, migration 095, checkout y aislamiento corrieron. El juez se ejecutó en secuencia sobre el estado final; no se ampliaron timeouts ni se desactivaron pruebas. No hubo merge posterior ni cambios de fuente tras el juez: solo se completó este ledger.