# Caja › Cuentas es el libro de la noche: resumen, lo sin cobrar en modales y los movimientos por hora

**Fecha**: 2026-09-25 · **Estado**: implementada en `claude/caja-redesign-diagnosis-b0d8a5`, sin mergear · **Decide**:
el dueño (variante, resumen, flechas de día, color de los montos, modales) + esta sesión (cómo)

## Origen

Fricción observada por el founder entrando al panel del piloto de noche (registrada en
`docs/gtm/ejecucion/10-aprendizajes.md`, 2026-09-24): Caja "es un quilombo, demasiado ruido visual; de
milagro encontré los movimientos".

Medido en producción al día siguiente (solo lectura, 10 noches del piloto):

- Unos 45 movimientos por noche (≈20 cobros de turno y ≈25 ventas de cantina) y **todos ingresos**: ningún
  gasto, movimiento manual, devolución, reposición de stock ni cierre en 10 noches.
- 16 turnos jugados y no cobrados (10 sin ningún pago, 6 a medias; 4 con más de 7 días).
- 8 fiados, 5 cobrados la misma noche desde la lista de Cuentas, que es el único lugar donde se cobra un fiado.
- 163 de 190 cobros de turno entraron dentro de las 2 h de terminado el partido; solo 3 se cobraron otro día.
- En Cuentas, "Movimientos del día" quedaba detrás de la tabla "Sin cobrar" de 25 filas con buscador y
  filtros; en el teléfono, debajo de toda la lista. Cada fila del diario llevaba una pastilla de color por
  categoría y el monto en verde: cuarenta y cinco verdes por noche.

La parte de cobrar turnos ya la tomó Hoy (`docs/decisions/2026-09-25-hoy-cobrar-ahora.md`). Esto es
refinamiento del panel (permitido desde el 2026-09-23): no cambia Server Actions, queries de plata ni schema.

## Qué se decide

1. **Cuentas es una columna que se lee de arriba a abajo** (variante "Libro de la noche", elegida por el
   dueño entre tres). Descartadas: movimientos a la izquierda y lo sin cobrar a la derecha (en la notebook
   empujaba lo sin cobrar fuera de la vista) y pestañas "Movimientos / Sin cobrar / Resumen" (esconde dos
   de las tres cosas).
2. **El cierre es un resumen automático**: "Entró hoy" con el total, efectivo, MercadoPago y transferencia
   (siempre los tres, aunque den cero) y cuánto fue de turnos, de cantina, de otros y de gastos. Sin contar
   billetes: el arqueo manual se eliminó el 2026-09-11 y nadie lo usaba. Sale de `getDaySummary` (el
   desglose por método es `collectedByMethod`, que suma exacto `collected`).
3. **Flechas de día** en vez de un historial: ‹ Ayer · Hoy ›. Es la misma lectura (`getDaySummary`,
   `getCashFlows`, `countCashFlows`) con otra fecha, por `?dia=AAAA-MM-DD` (`parseCajaDay`). Una fecha
   mal escrita, imposible o futura vuelve a hoy. Al pasar el corte nocturno la noche que terminó pasa a "Ayer" en vez de desaparecer. Lo
   sin cobrar no depende del día que se mira.
4. **Lo sin cobrar es una línea por tipo que abre su modal**: "N fiados sin cobrar · $X" y "N turnos no
   cobrados · $X" (el monto de los turnos en rojo), cada una con su diálogo y su lista. El dueño pidió
   explícitamente que los turnos no cobrados abran su modal en Caja y no manden a Hoy. El cobro es el mismo
   diálogo y las mismas Server Actions de antes (`StreetMoneyChargeDialog`: `chargeDebtAction`,
   `settleTabAction`, `registerInscriptionPaymentAction`; `StreetMoneyCancelTabDialog`), abierto encima de
   la lista, que queda abierta para cobrar el siguiente. La ventana de 12 meses (`?todas=1`) sigue igual.
5. **Los movimientos van agrupados por hora**, del más nuevo al más viejo, con el neto de cada hora y
   chips "Todo / Turnos / Cantina" (y "Gastos" solo si hay alguno) que filtran en el lugar. Cada fila dice
   quién pagó o qué se vendió; el tipo lo dice un ícono, no una pastilla de color. Página de 100 (antes 25):
   una noche del piloto entra entera.
6. **Montos en el color del texto con "+"**; solo lo que sale va en rojo con "−". Excepción a la
   Reserved Hues Rule de `DESIGN.md`, limitada al libro de Caja: ahí casi todo entra y el verde no
   distinguía nada.
7. **Nunca "deuda"**: el libro nombra un cobro de turno por quién pagó (o "Turno" / "Seña del turno"), y
   nunca muestra la descripción guardada, que en los cobros de turnos ya terminados dice "Cobro de deuda
   atrasada" (`caja/deudas/actions.ts`). Lo guardado no se toca: se corrige en la lectura (`ledger.ts`).
   El diálogo de cobro decía "Deuda de turno · pendiente $X" y pasa a "Turno no cobrado · pendiente $X"
   (solo el texto; lo encontró la revisión con contexto fresco).
8. **"Registrar movimiento" queda, pero callado**: un botón sin borde en el encabezado de los movimientos,
   solo en hoy (en un día pasado quedaría con la hora de ahora y fuera de ese día). En el piloto se usó cero
   veces en diez noches.
9. **Productos, después**, siguiendo este estilo (en diez noches hubo cero reposiciones).

## Qué no cambia

- Ninguna Server Action, query de plata ni tabla. `page.tsx` llama las mismas funciones del módulo
  `cashflow`; la única diferencia es que `getDaySummary`/`getCashFlows`/`countCashFlows` reciben el día
  elegido en vez de siempre hoy.
- El día operativo con el corte propio del complejo (`.claude/rules/caja.md`) y los cierres viejos con
  `expected_cash NULL`, que siguen sin reinterpretarse (Cuentas no los lee).
- Devolvés sigue arriba, solo con filas, y nunca se netea contra lo sin cobrar.

## Pendiente aparte: acreditar en efectivo lo no cobrado a las 24 horas

Pedido del dueño en la misma sesión: si un turno sigue sin cobrarse, que se acredite solo como cobrado en
efectivo. En el piloto eso era lo que pasaba en la práctica ("si no lo reclama queda como pago"), y una
lista de no cobrados que solo crece por mala práctica se vuelve ruido. El dueño asume que se pierde saber
si de verdad se cobró y en qué método: queda en la responsabilidad del complejo.

- **Plazo: 24 horas desde que terminó el turno** (`bookings.ends_at`). Decidido por el dueño el
  2026-09-26; reemplaza los 7 días del planteo original. Por qué:
  - En el piloto, 163 de 190 cobros de turno entraron dentro de las 2 h de terminado el partido y solo 3
    se cobraron otro día: pasadas 24 h, lo no cobrado casi nunca se cobra después.
  - Es el mismo corte que ya usa la base: `enforce_booking_invariants_fn` deja pasar un turno de
    `completed` a `no_show` solo dentro de las 24 h. Antes de eso no se acredita, porque el turno todavía
    puede terminar como ausente; después, ya no.
  - Costo asumido: los pocos que pagan otro día quedan acreditados en efectivo aunque paguen por otro
    medio, y un turno a medias (pagó un equipo) se acredita por lo que falta.
- **Cuándo cae en la caja**: en la noche en que corre el proceso, no en la noche en que se jugó.
  Descartado: fecharlo en la noche del turno.
- **Solo complejos vivos**: un complejo cancelado, bloqueado o dado de baja no se toca (en prod hay uno
  cancelado con 3 turnos no cobrados).
- **Va en su propio PR**, con revisor con contexto fresco: es un circuito de plata que escribe
  `cash_flows` desde un worker.
- **Efecto en producción**: medido el 2026-09-26 (solo lectura), el piloto tiene 20 turnos no cobrados
  por $ 1.329.000; la primera corrida acreditaría los **15 de más de 24 h, $ 975.000**. Necesita el OK del
  dueño antes de mergear.
- **Se ve igual que un cobro en efectivo** (decisión del dueño, 2026-09-26): el libro de Cuentas no lo
  distingue. La descripción guardada sí lo dice, para auditoría.
