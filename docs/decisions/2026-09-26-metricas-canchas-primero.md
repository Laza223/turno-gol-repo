# Métricas pasa a ser el mes y sus canchas

**Fecha**: 2026-09-26 · **Estado**: implementada en `refactor/metricas`, sin mergear · **Decide**: el dueño
(variante, comparación con el mes anterior, "Saldo", ocupación) + esta sesión (cómo)

## Origen

Pedido del dueño con el método de impeccable (shape → variantes → story temporal), igual que la Grilla y
la Agenda el 2026-09-25. Métricas (`/analiticas`; `/metricas` redirige) solo la ve el dueño y el caso que
él describe es mirarla en el celular a la noche, al cerrar o a fin de mes, para contestar en cinco segundos
"¿cómo me fue?" y "¿qué cancha / qué horario rinde?".

La página eran dos mitades con ventanas distintas, que se sentían como dos páginas pegadas:

- Arriba, en el cliente y con refresco cada 60 s: reservas por día, tasa de ausencias, "Ingresos" de los
  últimos 30 días con Día/Semana/Mes, los 5 horarios más reservados y el estado del sistema (superadmin).
- Abajo, en el server y con navegación de mes: KPI de Ingresos, Ajustes, Saldo y Reservas, "Tendencia
  mensual", un gráfico de ocupación y una tabla por cancha con los mismos datos, la tabla por método y el
  CSV.

Además, medido sobre el código:

- "Ingresos" aparecía dos veces con ventanas distintas (H032).
- El "% vs mes ant." comparaba el mes en curso, a medias, contra el mes anterior completo: el día 5 marcaba
  "↓ 83%" en rojo aunque el complejo viniera bien. "Tendencia mensual" dibujaba lo mismo en barras.
- "Saldo" es ingresos + ajustes y no resta los gastos de Caja. Con cero ajustes (en el Vagón hubo cero en
  diez noches) "Ajustes" decía $ 0 y "Saldo" repetía "Ingresos".
- La ocupación se calculaba sobre las horas de todo el mes, también con el mes en curso (arreglado
  aparte en #391).
- Los vacíos mostraban números de ejemplo (`GhostKpis` con $ 85.000, barras fantasma, "3,2%" de
  ausencias).
- Usaba `PageHeader` en vez del hueco de la barra superior.

`PRODUCT.md` dice que en los 8 días medidos el dueño no entró nunca a Métricas. El rediseño se hizo para el
caso que describe el dueño; si se usa o no, se mide aparte.

## Qué se decide

1. **Variante "Canchas primero"**, elegida entre tres con láminas a 1280×650 y 390 px, en claro y oscuro,
   sin datos, con un mes cerrado de 5 canchas y con un mes en curso de 12 canchas y ajustes negativos.
   La página es el mes que se elige con las flechas de la barra. Arriba, una tarjeta con lo que entró y cada
   cancha de la que más cobró a la que menos (monto, barra contra la que más cobró, turnos y % de
   ocupación); a 1280×650 entran doce canchas sin scrollear. Abajo, "Por dónde entró" y, solo en el mes en
   curso, "Últimos 30 días" (horarios más pedidos y ausencias). Descartadas: "El mes con su curva" (el total
   con una barra por día; la curva solo existía en el mes en curso y en un mes cerrado pedía otra consulta)
   y "Mes | Últimos 30 días" en pestañas (la que menos cambiaba; en el celular hacían falta cuatro
   tarjetas para decir un número y escondía los horarios detrás de un clic).
2. **Contra el mes anterior, sin porcentaje mientras el mes no cerró**: con el mes en curso va "En todo
   agosto: $ X" como referencia; con el mes cerrado, "↗ 8% vs julio ($ X)". Comparar contra los mismos días
   del mes anterior pediría una consulta nueva y no se hizo.
3. **"Con ajustes" en lugar de "Saldo", y solo si hubo ajustes.** El número no cambia: sigue siendo
   ingresos + ajustes.
4. **La ocupación no se toca en este cambio y se registra** (`10-aprendizajes.md`, 2026-09-26). El dueño la
   arregló aparte el mismo día (#391, `occupancyEndDate` en `report.utils.ts`): en el mes en curso cuenta
   del 1 a hoy inclusive.
5. **Se resta**: los cuatro gráficos (Reservas por día, Ingresos de 30 días con Día/Semana/Mes, Tendencia
   mensual y Ocupación), la tabla por cancha duplicada, los vacíos con números de ejemplo, "Ajustes" y
   "Saldo" en cero y el `PageHeader`. Sin gráficos, `recharts` y `useChartTheme` salen del proyecto.
6. **Los últimos 30 días solo en el mes en curso**: son de ahora, y al lado de un mes cerrado no dicen
   nada. En un mes cerrado ni se piden. Horarios y ausencias por mes pedirían otra consulta.

## Qué no cambia

- `report.service.ts`, `metrics.service.ts`, las rutas `/api/admin/metrics` y `/api/reports/revenue` (el
  CSV), el guard `requireAdminStaff` y el cálculo del mes en día operativo del complejo.
- El estado del sistema del superadmin, que sigue al pie.

## Verificación

Stories de la página (`Analiticas.stories.tsx`: mes en curso con 12 canchas y ajustes, mes cerrado, primer
mes, sin datos y mes pasado vacío) y de la parte cliente (`MetricsDashboard.stories.tsx`), con play y a11y en
claro y oscuro. `/analiticas` no tiene foto de regresión visual: no hubo baseline que regenerar.
