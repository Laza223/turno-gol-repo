# Aplicación de la baja SaaS a $30.000 por cancha

Decisión: [2026-10-20](../decisions/2026-10-20-precio-uniforme-por-cancha.md). Retoma la baja de #408, que se revirtió en #409 porque la migración 095 abortaba en producción por el preapproval pending de El Vagón.

## Qué pasa al mergear

Un push a main ejecuta `db-migrate.yml`, que aplica la 095. Vercel despliega el código en paralelo.

- La 095 cambia **solo el catálogo**:
  - primera cancha = cancha extra = 3.000.000 centavos;
  - 1000 bps de descuento anual;
  - una versión nueva en `price_versions` y la anterior cerrada.
- No toca suscripciones ni preapprovals.
- Ya no aborta por preapprovals vivos: el dueño sacó ese guard el 2026-10-20 (ver la decisión).
- Sigue abortando si el catálogo de producción no es el esperado:
  - un solo plan activo `turnogol`;
  - $47.000 + $30.000;
  - bps 1000;
  - una sola versión vigente.

  Ninguna migración posterior a la 091 toca `plans`. Si aborta igual, se revierte el PR como en #409 y no se edita la base a mano.

## Efecto por tipo de suscripción

- **Pending sin cobrar (El Vagón):**
  - No cobra nada.
  - Cuando el complejo toca "Activar plan", `subscribe()` calcula con el catálogo nuevo. Como el monto no coincide, no reusa el link viejo.
  - Crea uno nuevo de $150.000/mes (5 canchas) con primer cobro en `trial_ends_at` (2026-12-06).
  - El link viejo de $99.000 queda vivo sin vincular. Si alguien lo paga después de activar, `onPaymentApproved` lo trata como huérfano y lo cancela. Antes de activar, pagarlo cobraría $99.000 en el acto: es un riesgo previo a este cambio. No mandarle nunca ese link.
- **Débito autorizado a precio viejo:**
  - Hoy no se conoce ninguno en producción.
  - Sigue cobrando su monto actual, el mismo de hoy, hasta que se lo baje.
  - El reconciliador registra `subscription.amount_drift`.
  - Para bajarlo se usa el script de abajo.
- **Altas nuevas:** nacen a $30.000 por cancha.

## Verificar después del merge

- Job `db-migrate.yml` en verde.
- `/precios` y Configuración → Facturación muestran $30.000 por cancha.
- El MRR del super-admin se recalcula.
- Si aparece un `subscription.amount_drift`, revisarlo con el dueño antes de tocar nada.

## Bajar un débito ya autorizado (solo si aparece uno)

Hace falta un archivo de entorno privado con `WORKER_DATABASE_URL` y el token master de Suscripciones. Nunca el OAuth de señas.

```powershell
pnpm exec tsx scripts/billing/reprice-subscriptions.ts --env-file <archivo-privado> --output <manifest-nuevo.json>
pnpm exec tsx scripts/billing/reprice-subscriptions.ts --env-file <archivo-privado> --apply --manifest <manifest-revisado.json> --billing-paused
```

- El inventario es de solo lectura.
- El manifiesto tiene datos personales: no subirlo al repo.
- El `--apply`:
  - solo baja importes;
  - verifica antes y después de cada PUT;
  - deja `subscription.price_repriced`.
- No hay rollback automático que suba precios.
- El caso de El Vagón lo rechaza a propósito: no hay débito que bajar.
