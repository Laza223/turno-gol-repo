# AUD-09 — El borrado por retención dejaba el nombre de la cuenta de MercadoPago

Tarea T-A del lote 2 de la auditoría técnica integral del 2026-09-06 (hallazgo AUD-09, §D.1).
Rama a partir de `main` = `1caa41c544ba56f12703ed4f29235524e3b81cef`.

## Causa

`wipeTenant` (`src/shared/jobs/workers/data-retention-cleanup.worker.ts`) anonimiza la fila del
complejo cuando vence el plazo de retención: nombre, dirección, teléfono, correo, coordenadas y
las cuatro credenciales de MercadoPago. Se le escapaban dos columnas de la migración 069:

- `mp_nickname`: el nombre **visible** de la cuenta de MercadoPago. En un monotributista es el
  nombre de una persona.
- `mp_connected_at`: la marca de cuándo se conectó esa cuenta.

Quedaban en la fila después del borrado. Es dato personal sobreviviendo a la baja, justo lo que
la Ley 25.326 y la promesa de `/terminos` dicen que no pasa. El test de retención afirmaba una
por una las demás columnas, así que el hueco tampoco tenía red.

## Cambio

Las dos columnas entran al mismo `UPDATE` que ya corre. Es el mismo conjunto que limpia la
desvinculación de MercadoPago en `tenant.service.ts`: después del borrado no puede quedar rastro
de a qué cuenta estuvo atado el complejo. Sin migración, sin cambio de contrato, sin tocar el
resto del barrido.

`tests/helpers/retention.ts` siembra ahora un nickname (`'MARCELO PEREZ'`) y la marca de
conexión, para que la aserción tenga algo que borrar.

## La prueba

Rojo antes del arreglo, con el test nuevo contra el código de `main`:

```
× data-retention-cleanup > borra TODA fila hija y anonimiza el tenant cuando scheduled_deletion_at <= NOW()
  → expected 'MARCELO PEREZ' to be null
```

Verde con el arreglo: `Test Files 1 passed (1) · Tests 11 passed (11)`.

## Validación

Sobre esta rama, con Postgres descartable (`postgres:15-alpine`, las 84 migraciones aplicadas con
la misma receta que el job de CI):

| Comando | Resultado |
|---|---|
| `vitest run tests/integration/data-retention-cleanup.test.ts` | 11 passed |
| `pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm knip` | los cuatro limpios |

## Limitaciones

- No se ejercitó el barrido contra datos reales de producción; el test usa un complejo sembrado.
- El resto del lote (AUD-06, AUD-02, AUD-14) va en PRs separados.
