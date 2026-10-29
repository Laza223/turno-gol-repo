---
version: 1
slug: "src-app-admin-analiticas"
primary_target: "src/app/(admin)/analiticas"
related_targets: ["src/app/(admin)/metricas"]
---

# Métricas (src/app/(admin)/analiticas)

Spec visual vigente de la pantalla. Vivía en DESIGN.md › Components y se movió acá el 2026-10-29 sin cambios de contenido, para que DESIGN.md quede con lo que comparten todas las pantallas (tokens, reglas y componentes compartidos), que sigue mandando sobre esto. Esta pantalla todavía no tiene brief de `shape`.

## Métricas (el mes y sus canchas)

`/analiticas` (`/metricas` redirige), solo del dueño. Rehecha el 2026-09-26 porque eran dos páginas pegadas: 30 días corridos arriba y el mes abajo, con "Ingresos" dos veces y cada uno en su ventana (`docs/decisions/2026-09-26-metricas-canchas-primero.md`). El dueño eligió la variante "Canchas primero" entre tres. Tiene que contestar en el celular, en cinco segundos, "¿cómo me fue?" y "¿qué cancha rinde?". De arriba a abajo:

- **Mes:** flechas ‹ › con "Septiembre de 2026" (`MonthStepper`). Desde `lg` cuelgan del hueco de la barra, con "Exportar CSV" a la derecha; en el teléfono bajan arriba del contenido y el CSV va al pie. En el mes en curso la flecha de adelante se apaga. Todo es de ese mes, salvo "Últimos 30 días".
- **El mes y sus canchas:** una tarjeta. Arriba "Entró en septiembre, hasta hoy" ("Entró en agosto" si ya cerró), el total en `font-display` de 30 px y "N turnos en el mes". A la derecha va la comparación con el mes anterior: con el mes en curso, el total del anterior como referencia ("En todo agosto: $ X"), sin porcentaje, porque un mes a medias contra uno completo daba "−83%" el día 5; con el mes cerrado, el porcentaje ("↗ 8% vs julio ($ X)"). "Ajustes −$ X · Con ajustes $ Y" aparece solo si hubo ajustes; dice "Con ajustes" y no "Saldo" porque no resta los gastos de Caja. Debajo, las canchas de la que más cobró a la que menos: nombre, el monto en `font-display` de 18 px, una barra `primary` contra la que más cobró (la de "Lo que más salió") y "N turnos · X% ocupada". Una columna en el teléfono, dos desde `sm` y tres desde `xl`: a 1280×650 entran doce canchas sin scrollear.
- **Por dónde entró:** efectivo, MercadoPago y transferencia siempre, aunque den cero, y "Otro" si hubo, igual que en el resumen de Caja › Cuentas.
- **Últimos 30 días:** solo en el mes en curso, al lado de "Por dónde entró" desde `lg`. Los cinco horarios más pedidos con barra y las ausencias con su tendencia, sin flecha ni color con menos de 30 turnos terminados. Se refresca solo cada minuto. En un mes cerrado no aparece, porque los 30 días corridos son de ahora.
- **Vacío:** uno solo y honesto, `EmptyState` "Todavía no hay cobros en septiembre" con "Ir a la Grilla" ("En agosto no hubo cobros" en un mes pasado). Nada de números de ejemplo: se fueron los KPI fantasma, las barras fantasma y el "3,2%".
- **Sin librería de gráficos:** una barra horizontal hecha con un `div` alcanza para comparar, y recharts se sacó del proyecto con este cambio.
- **Ocupación por cancha:** minutos reservados sobre minutos que la cancha estuvo abierta, en el mismo tramo. En el mes en curso el tramo va del 1 a hoy inclusive (día operativo del complejo): un turno de mañana todavía no suma, y los días que faltan tampoco cuentan en el total. Un mes cerrado cuenta entero; uno que no empezó marca 0%.
- El estado del sistema, que solo ve el superadmin de la plataforma, sigue al pie.
