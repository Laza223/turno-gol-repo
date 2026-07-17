# Deprecación de la tabla `products` (#6)

**Fecha:** 2026-07-17
**Estado:** Decidida (dueño: Lazar) — implementación en curso
**Migración:** `046_drop_products_table.sql`

## Problema

La tabla `products` (migr. 004, con RLS FORCE en migr. 021) está **100% muerta**:
cero `INSERT`/`SELECT`/`UPDATE` en toda la app. La cantina real vive en el JSONB
`tenants.settings.canteen_products` (name, price, stock opcional), que cubre el
caso de uso de v1 (cobrar + descontar stock). La columna `cash_flows.product_id`
(FK → `products.id`) nunca se puebla (la venta de cantina llama `createCashFlow`
sin `productId`), así que la FK es decorativa y una **trampa latente**: apunta a
una tabla vacía y podría explotar si alguien intentara meter ahí el id (string
libre) de un producto del JSONB.

## Alternativas descartadas

1. **Build (construir el módulo de inventario real ahora):** migrar
   `canteen_products` JSONB → filas de `products`, poblar `cash_flows.product_id`,
   CRUD, reportes por producto, SKU/categoría/low-stock. **Descartada:** el dueño
   confirmó que inventario/reportes de cantina **no** es un diferencial de venta
   para v1. TurnoGol vende reservas + grilla + caja; la cantina es un accesorio
   (cobrar rápido). Además el esqueleto actual no ahorra casi nada: el costo real
   de un módulo de inventario está en la lógica (UI, reportes, movimientos,
   migración de datos), no en el `CREATE TABLE`.
2. **Dejar como está (no tocar):** **Descartada** por deuda permanente —
   confusión para todo dev futuro (parece que `products` se usa) + la trampa de
   FK sigue latente.

## Decisión

**Deprecar: borrar la tabla `products` + la columna vestigial
`cash_flows.product_id`** + todo su cordón en el código (schema Drizzle,
lecturas/escrituras en `cashflow.service`, tipos, fixtures, el `DELETE FROM
products` del wipe de retención, y el caso de `products` en `isolation.test.ts`).
La cantina sigue en JSONB, sin cambios de comportamiento.

Si post-v1 se quiere inventario en serio → módulo nuevo con diseño propio
(candidato **v1.5**), no reviviendo este esqueleto.

## Reversibilidad

**Barata.** No hay datos que migrar: la tabla está vacía y la columna es siempre
`NULL`. Rollback = migración inversa que re-crea tabla + columna (nunca va a
necesitarse por pérdida de datos, porque no hay). El costo de un módulo futuro es
la lógica, no el DDL — borrar hoy no genera doble trabajo material.

## Consecuencias aceptadas

- Se pierde el esqueleto `sku`/`category`/`low_stock_alert`/`is_active` (nunca
  usado). Un módulo v1.5 lo rediseñaría igual.
- No hay ventana expand-contract real: la migración destructiva y el código que
  deja de referenciar `product_id` van juntos, aplicados sobre una base sin datos
  de producción (pre-launch). CI aplica `src/shared/db/migrations/0*.sql` directo
  vía psql (la 046 incluida). Para `supabase:reset`/`supabase db push` locales hay
  que correr antes `pnpm db:sync-supabase` (deny-listeada para el agente) y
  commitear el espejo `supabase/migrations/20*_drop_products_table.sql`; sin ese
  sync un reset local resucita `products` desde 004/021.
- La cantina hereda los límites del JSONB (sin reportes por producto, sin
  historial de movimientos), aceptados explícitamente para v1.
