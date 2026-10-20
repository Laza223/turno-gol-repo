# Aplicación de la baja SaaS a $30.000 por cancha

Decisión: [2026-10-20](../decisions/2026-10-20-precio-uniforme-por-cancha.md). Retoma la baja de #408, revertida en #409 por mergearse sin estos gates. Este runbook prepara la operación; no habilita producción por sí mismo. El PR no debe mergearse hasta completar las condiciones siguientes: un push a main ejecuta el workflow `db-migrate.yml`.

## Gates previos al merge

- Acceso administrativo de lectura y token master de la aplicación de Suscripciones disponibles. No usar los tokens OAuth de señas. No imprimir secretos ni guardar manifiestos en Git.
- Inventario local y remoto completo, incluida búsqueda de preapprovals vivos que no sean el id local actual. Revisar `leftPendingMpSubscriptionId` en auditoría y paginar `/preapproval/search`. Un huérfano vivo, un terminal local con MP vivo, moneda distinta de ARS o frecuencia inesperada requiere resolución manual antes del lote.
- Probar con suscripciones de prueba de MP, autorizada y pendiente: importe nuevo, ARS, frecuencia, `start_date`, `end_date`, `next_payment_date` y ausencia de cobro inmediato. Los mocks validan nuestro payload, no la semántica del proveedor.
- Revisar cargos emitidos y reintentos pendientes. No prometer que la baja modifica un cargo ya generado. Detener y consultar ese caso; no reembolsar ni recrear suscripciones como solución automática.
- Autorizar la aplicación real y definir una ventana anterior al próximo débito. Evitar cobros en tránsito. Conservar la aprobación y la evidencia fuera del manifiesto de datos personales.
- Suspender operativamente altas, reactivaciones, cambios de canchas/ciclo y escrituras de workers/webhooks de billing durante la ventana, conservando entregas para procesarlas después. El repo no tiene un interruptor global comprobado. **`--billing-paused` es una declaración del operador, no implementa esa suspensión.** Si no se puede asegurar la ventana, no ejecutar.

Referencia primaria: [GET suscripción](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/get-preapproval/get), [PUT suscripción](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/update-preapproval/put) y [búsqueda](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/search-preapproval/get). La documentación permite actualizar el importe; la fecha y ausencia de efectos inmediatos deben comprobarse en la prueba del proveedor.

## Gate El Vagón (manual, de Lazar, antes del merge)

El preapproval vivo de El Vagón (`a81bc5…`) está **pending**: $99.000, `start_date` 2026-09-07, nunca pagado; prueba hasta 2026-12-06. Con su suscripción local apuntando a ese id y sin auditoría `subscription.price_repriced`, la 095 aborta. Fue exactamente lo que trabó producción el 2026-10-02. El script de reprice no lo puede resolver (rechaza `start_date` anterior al fin de la prueba y un objetivo mayor al importe actual) y ese link no se debe pagar nunca: cobraría en el acto.

Antes de autorizar el merge, Lazar elige y ejecuta una de estas salidas, con evidencia guardada fuera del repo:

1. **Desvincular el pending viejo.** Cancelarlo en MP con el token master (MP le manda un mail al dueño: avisarle antes) y dejar `tenant_subscriptions.mp_subscription_id` en NULL para El Vagón, con su auditoría. La 095 pasa. El Vagón activa después y su preapproval nuevo nace a $150.000 con primer cobro el 2026-12-06.
2. **Que El Vagón active antes del merge.** El checkout crea uno de $167.000 con `start_date` 2026-12-06; el inventario lo encuentra compatible y el `--apply` lo baja a $150.000 y deja la auditoría. La 095 pasa. El pending de $99.000 queda huérfano y vivo: cancelarlo igual (mismo mail).

En los dos casos: re-confirmar en el inventario `billed_courts` (5 según la medición del 2026-09-27, lo que da $150.000/mes) y que no haya otro id vivo local o remoto. Si aparece cualquier caso distinto, frenar y consultar.

## Preparar inventario (solo lectura)

Usar un archivo de entorno privado con `WORKER_DATABASE_URL` y el token master; el proceso de aplicación necesita también la conexión restringida usada por `withTenantContext` para escribir auditoría. `--env-file` se carga antes del runtime, sin sobrescribir variables ya presentes: confirmar que el proceso apunta al entorno esperado.

```powershell
pnpm exec tsx scripts/billing/reprice-subscriptions.ts --env-file <archivo-privado> --output <manifest-nuevo.json>
```

El archivo de salida se crea exclusivamente, nunca sobrescribe evidencia. Contiene datos personales/operativos: guardar en ubicación privada y no subir al PR. El script no imprime email ni tokens. Revisar todos los registros y los omitidos. Usa `billed_courts` y calcula explícitamente primera=extra=3.000.000 centavos, anual 1000 bps; no depende del catálogo viejo.

El lote rechaza aumentos, vínculos remotos ajenos, estados/frecuencias desconocidos, locks vigentes o pruebas con fecha remota insuficiente. No cambia estados, períodos ni pendientes. Suspended/blocked requieren revisión: la operación automática solo acepta trialing/active/past_due. Si el caso no es compatible, conservar evidencia y resolver antes de aplicar; no editar JSON para saltear el control.

Comparar importes fijos: 1 cancha $30.000 mensual / $324.000 anual; 3 $90.000 / $972.000; 5 $150.000 / $1.620.000; 12 $360.000 / $3.888.000. El equivalente mensual anual no es el importe del preapproval.

## Aplicar MP y confirmar

Solo después de los gates y con autorización de la operación real:

```powershell
pnpm exec tsx scripts/billing/reprice-subscriptions.ts --env-file <archivo-privado> --apply --manifest <manifest-revisado.json> --billing-paused
```

El script vuelve a leer el snapshot local y remoto antes de cada operación. Solo admite el importe previo o el objetivo ya aplicado. Después del PUT exige importe nuevo y mismo estado, frecuencia, fechas e historial de cobros; vuelve a leer DB y escribe `subscription.price_repriced` con importe, id MP, ciclo, cantidad y `updated_at` completo. No conserva una transacción SQL abierta durante MP.

Si un PUT termina en timeout o falla la auditoría, el proceso se detiene y puede haber importes remotos ya bajados. Leer DB y MP antes de retomar. Si los snapshots siguen iguales, repetir el mismo manifiesto reconoce el objetivo aplicado y verifica sin otro PUT; registra la auditoría faltante. Si cambió una fecha o un cobro, generar inventario nuevo y revisar. **No hay rollback automático que aumente precios.**

Reinventariar todos los locales y comparar todos los ids remotos al terminar; buscar de nuevo huérfanos. La auditoría local no prueba que MP siga igual si hubo actividad posterior. Un cargo concurrente detiene el lote; revisar el débito antes de decidir cómo seguir.

## Aplicar catálogo y reabrir

Mantener la ventana. Antes del merge verificar cada `subscription.price_repriced` contra la suscripción actual. La migración 095 aborta por cualquier preapproval local vivo sin auditoría de objetivo y snapshot vigente; compara microsegundos de `updated_at`. No detecta por sí sola huérfanos remotos ni cambios fuera de DB.

Autorizar merge solo después de esta comprobación y el juez del PR. No ejecutar `db:push`/`db:migrate`/`db:sync-supabase` desde el asistente. El workflow aplica el espejo nuevo. Esperar confirmación del job: catálogo primera=extra=3.000.000, bps=1000, referencias mensual=3.000.000 y anual=2.700.000; exactamente una fila activa `turnogol`, sin techo; historial anterior cerrado y nueva versión vigente.

Verificar `/precios`, facturación, SuperAdmin/MRR y drift remoto. Restaurar procesos y solicitudes suspendidas; verificar un alta nueva y que un cambio pendiente se aplique en su fecha usando la lista nueva. Monitorear la primera renovación real y el reconciliador; cualquier monto fuera del objetivo se presenta al dueño, no se corrige automáticamente sin evidencia.

## Estado al preparar el PR (2026-10-20)

- Migración, script y tests probados en PostgreSQL descartable; ninguna escritura real de MP ni de producción.
- Gate El Vagón **pendiente**: la 095 abortaría hoy en producción.
- Prueba con suscripciones de prueba de MP, inventario remoto y búsqueda de huérfanos, acceso de lectura y ventana de concurrencia: **pendientes**. Son bloqueantes para merge y aplicación; los tests locales no los prueban.
