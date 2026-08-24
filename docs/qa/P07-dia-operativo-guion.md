# P-07 — Un día operativo completo, cerrado ✅

**Ejecutado**: 2026-08-24, 13:09–13:17 ART, en **producción** (`turnogol.app`), operado end-to-end desde el navegador.
**Complejo**: `complejo-titi` — no `complejo-elite-futbol` como preveía el guion original: la sesión activa era la de titi, y sirve igual (la contabilidad no depende del plan). De yapa quedó probado que un complejo **dado de baja con período vigente puede seguir operando y escribiendo** (ENS-26, verificado del lado de escritura y no solo de lectura).

**Resultado: el día cerró con `diff_amount = 0`.** El criterio de vendible correspondiente queda cumplido.

## Lo que se hizo, en orden

| # | Paso | Resultado |
|---|---|---|
| 1 | Abrir caja, fondo $5.000 | `daily_cash_opens.opening_cash = 500000` |
| 2 | Cargar 3 productos con stock 10 (Gaseosa $2.000 · Agua $1.500 · Alfajor $1.000) | catálogo OK, margen 40% calculado solo |
| 3 | 2 reservas de hoy, $100 c/u: una **efectivo**, otra **transferencia** | las dos quedaron "Señada" |
| 4 | Venta de cantina multi-ítem (Gaseosa + Alfajor) $3.000 efectivo | 1 `cash_flows` + 2 líneas de ledger |
| 5 | Fiado de 2 Agua $3.000 a "Pedro P07" | stock bajó, plata no entró |
| 6 | Cobrar el fiado, efectivo | `canteen_tabs.status = paid` |
| 7 | Gasto de $2.000 efectivo (Servicios) | `expense` / `utilities` |
| 8 | Cerrar contando $9.100 | **"Caja cerrada — el efectivo cuadró"** |

## La cuenta, medida contra la base

```
Fondo inicial               +  5.000
Reserva A (efectivo)        +    100
Venta cantina (efectivo)    +  3.000
Fiado cobrado (efectivo)    +  3.000
Gasto (efectivo)            -  2.000
                            =========
Efectivo esperado              9.100   ← lo que dijo el sistema
Efectivo contado               9.100
Diferencia                         0
```

La reserva por transferencia ($100) entró a `total_income` y **no** a `expected_cash`: esa es la invariante central de este ensayo y se cumplió.

| Dato | Esperado | Real (producción) |
|---|---|---|
| `opening_cash` | 500000 | 500000 ✅ |
| `expected_cash` | 910000 | 910000 ✅ |
| `declared_cash` | 910000 | 910000 ✅ |
| `diff_amount` | 0 | **0** ✅ |
| `total_income` | 620000 | 620000 ✅ |
| `total_expense` | 200000 | 200000 ✅ |
| Stock final | Gaseosa 9 · Agua 8 · Alfajor 9 | idem ✅ |

## Las 5 invariantes, una por una

1. **`diff_amount = 0` y `expected_cash = opening_cash + neto en efectivo`** — 910000 = 500000 + 410000. ✅
2. **El ingreso por transferencia no infla el efectivo** — "Desglose por método" separó Efectivo $4.100 / Transferencia $100, y solo el primero entró al esperado. ✅
3. **Venta multi-ítem = un `cash_flows` + N líneas de ledger atadas a ese id** — 2 líneas (`sale`, qty −1 cada una) con el mismo `cash_flow_id`. ✅
4. **El fiado mueve stock al entregar y plata al cobrar** — la línea de Agua (qty −2) tiene `tab_id` y **`cash_flow_id` nulo**; el `cash_flows` del cobro, una hora-minuto después, no tiene líneas de stock propias. ✅
5. **El cierre snapshotea `opening_cash`/`expected_cash`** — ambos quedaron congelados en la fila de `daily_cash_closes`. ✅

**Extra no pedido, verificado igual**: con el día cerrado, la cantina muestra *"La caja de hoy ya está cerrada. Podés anotar fiados; las ventas y cobros se habilitan con la caja abierta"* — el guard de inmutabilidad del cierre funciona en la UI, y deja abierto justo el camino que no toca plata.

## Dos cosas menores que aparecieron

🟢 **El movimiento de caja de una seña muestra el UUID crudo del turno.** En la lista de Caja se lee `Seña — turno 74b3ab6b-c755-47da-a673-9fc1c394961d`. Es la pantalla que el encargado mira todos los días y ya existe `bookingCode()` para eso. No afecta ningún número.

🟢 **El stock inicial que se carga al crear un producto no deja línea en `stock_movements`.** Se escribe directo en `canteen_products.stock`, así que el stock actual no es reconstruible sumando el ledger — el arranque no está registrado en ningún lado. Puede ser deliberado; queda anotado porque el ledger se vende como append-only.
