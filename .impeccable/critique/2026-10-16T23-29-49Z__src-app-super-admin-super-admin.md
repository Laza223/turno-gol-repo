---
target: panel superadmin
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\Users\\Lazar\\Documents\\github\\TurnoGol-wt-sa-pulso\\src\\app\\(super-admin)\\super-admin"
timestamp: 2026-10-16T23-29-49Z
slug: src-app-super-admin-super-admin
---
Method: dual-agent (A: revisión de diseño · B: detector)

## Salud de diseño: 19/40, Pobre

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 1 | Nada de "hoy": las 9 reservas online del 2026-10-16 no tenían dónde aparecer |
| 2 | Lenguaje del usuario | 1 | MRR, Tenants, Slug, Churned, Dunning, Preapproval, processed_webhooks |
| 3 | Control y libertad | 3 | Volver, Limpiar y pestañas por URL |
| 4 | Consistencia | 2 | Piel violeta contra esmeralda; el detalle con h1 propio y sin PageHeader |
| 5 | Prevención de errores | 3 | Frase tipeada y ConfirmDialog en soporte |
| 6 | Reconocer, no recordar | 1 | Enums crudos y JSON en el audit log |
| 7 | Eficiencia | 1 | Sin filtro por actividad; comparar complejos exige entrar a cada uno |
| 8 | Minimalismo | 2 | Estados en 0 y notas técnicas en pantalla |
| 9 | Recuperación de errores | 2 | El timeout no dice qué falló |
| 10 | Ayuda | 3 | Los subtítulos de los KPI explican |

## ¿Está pensado para este producto?
No: es un admin SaaS genérico que mira tablas internas (MRR, colas, webhooks), no el negocio. Lo de cada mes va primero y lo de cada minuto no existe (contradice el principio 1 de PRODUCT.md). Detector: 2 hallazgos (text-[11px] en dashboard-view.tsx:234; side-tab en super-admin-layout-shell.tsx:102, falso positivo parcial). Overlay en navegador no corrido (plan mode, ruta con login).

## Problemas prioritarios
1. [P0] No hay métricas de jugadores ni de reservas → banda Hoy/7d/30d + sección Jugadores. (/impeccable shape)
2. [P0] Dashboard todo-o-nada con timeout → secciones aisladas con tope y fallback. (/impeccable harden)
3. [P1] Jerarquía invertida (MRR y 8 estados arriba) → Actividad → Pide atención → Lo último → Plata → Alta → Salud. (/impeccable layout)
4. [P1] Lista de complejos sin señales de vida y min-w-[880px] en el teléfono. (/impeccable adapt)
5. [P2] Jerga e inglés en todo el panel. (/impeccable clarify)

## Alertas por persona
- Alex: no puede ordenar ni comparar complejos; JSON truncado.
- Sam: divide-slate-100 desaparece en oscuro (8 lugares); barras del embudo sin rol.
- Lazar desde el celular: scroll horizontal a 375 px; 4 KPI apilados antes de algo útil.

## Menores
Fechas ISO y dd/mm; text-red-600 fijo; botón crudo con hover:bg-emerald-700; "mediana 2.3d"; falta tabular-nums en "Canchas facturadas".

## Preguntas
- Si abrís el panel una vez por día, ¿la cifra es MRR o "reservas online hoy"?
- ¿Cuánto del dashboard queda si se borra lo que hoy vale 0?
