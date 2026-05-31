# Prompt para Opus 4.7 — Roadmap Completo de Producción TurnoGol

> **Instrucciones para Lazar:** Copiá todo el bloque de abajo (desde `---START---` hasta `---END---`) y pegalo como prompt en Claude Code con Opus 4.7. Asegurate de estar en el directorio raíz de TurnoGol.

---

## `---START---`

```
Necesito que actúes como un Staff Engineer / Principal Engineer con +15 años de experiencia diseñando, auditando y llevando a producción plataformas B2B/B2C de reservas y gestión en tiempo real — del nivel de ATC Sports, Playtomic, MiCancha o similares.

## Contexto del proyecto

TurnoGol es una plataforma SaaS B2B2C para la gestión integral de complejos de canchas de fútbol en Argentina. No es un SaaS simple — el objetivo es convertirse en LA plataforma del ecosistema, cambiando cómo operan los complejos y cómo reservan turnos los usuarios finales.

Stack técnico:
- Backend: Next.js 14 App Router (API Routes), TypeScript strict, Drizzle ORM
- Base de datos: Supabase (PostgreSQL con RLS para multi-tenancy)
- Auth: Supabase Auth
- Realtime: Supabase Realtime (suscripciones en la grilla de turnos)
- Queue/Jobs: pg-boss (background jobs, DLQ)
- Pagos: MercadoPago (webhooks, IPN)
- Cache: Upstash Redis
- Email: Resend
- Observabilidad: Sentry
- Testing: Vitest (unit/integration), Playwright (E2E)
- Frontend: React, Tailwind CSS, shadcn/ui
- Deploy previsto: Vercel (frontend/API) + Supabase (DB/Auth/Realtime)

Estado actual:
- Hay una auditoría en curso de 26 fases (12 backend completadas, 5 frontend completadas). Ver `docs/audit/STATE.md` y `docs/audit/MASTER_PLAN.md`.
- ~750 tests existentes (422 unit, 325 integration, 11 E2E specs)
- 34 bugs encontrados y corregidos en la auditoría
- 14 módulos de dominio en `src/modules/`
- Máquina de estados para bookings, manejo de concurrencia, manejo de dinero en enteros

## Tu tarea

Analizá el codebase completo de TurnoGol en profundidad. Leé el código fuente, los tests, la configuración, la base de datos (schemas de Drizzle), las migraciones, los middleware, los handlers, los servicios, los componentes de UI, las rutas, y toda la documentación existente.

Con base en ese análisis real (no suposiciones), generá un **roadmap exhaustivo y priorizado de TODAS las áreas de acción necesarias** para que TurnoGol llegue a producción como una plataforma robusta, escalable y competitiva a nivel de ATC Sports o Playtomic.

## Reglas estrictas

1. **Sé brutalmente honesto.** El dueño del proyecto fue programador profesional, trabajó con arquitectura limpia y SOLID en proyectos reales. No quiere respuestas amables — quiere la verdad técnica aunque duela. Si algo está mal, decilo. Si algo no es necesario, también decilo ("Che, esto no necesitás blindarlo porque no aplica a tu caso").

2. **Basate exclusivamente en el código real.** No asumas. Leé los archivos. Si no encontrás algo, decí que no lo encontraste. No inventes que existe algo que no existe ni que falta algo que sí está.

3. **Pensá en escala.** El objetivo es soportar miles de usuarios simultáneos, cientos de complejos, y operación 24/7. Cada recomendación debe justificarse en ese contexto.

4. **Diferenciá entre "necesario para lanzar" y "necesario para escalar".** No todo tiene que estar el día 1, pero necesito saber qué me falta y cuándo debería atacarlo.

5. **Investigá ATC Sports** (atcsports.com.ar) como referencia competitiva. Entendé qué funcionalidades ofrece y comparalas con lo que TurnoGol tiene o no tiene.

## Formato de salida esperado

Organizá el roadmap en **sectores de acción**, cada uno con:

### Para cada sector:
- **Nombre del sector** (ej: "Seguridad", "Performance", "Infraestructura")
- **Estado actual** — qué tiene TurnoGol hoy en este sector (basado en el código real)
- **Gaps críticos** — qué falta y por qué importa
- **Acciones concretas** — qué hacer exactamente, con nivel de detalle técnico (no "mejorar la seguridad", sino "implementar CSRF tokens en los forms de admin porque actualmente los API routes de Next.js no los validan")
- **Prioridad** — Clasificar cada acción como:
  - 🔴 **P0 - Blocker de lanzamiento** (sin esto no podés salir a producción)
  - 🟡 **P1 - Necesario pre-escala** (podés lanzar sin esto pero te va a explotar cuando crezcas)
  - 🟢 **P2 - Mejora competitiva** (no es crítico pero te diferencia de la competencia)
  - ⚪ **P3 - Nice to have** (podés vivir sin esto indefinidamente)
- **Esfuerzo estimado** — T-shirt sizing (S/M/L/XL) y justificación

### Sectores mínimos que DEBEN estar cubiertos (agregá los que consideres necesarios):

1. **Correctitud funcional** — ¿Todos los flujos core funcionan correctamente? ¿Hay edge cases sin cubrir?
2. **Seguridad** — Auth, autorización, RLS, CSRF, rate limiting, input sanitization, headers HTTP, secrets management, inyección SQL/XSS
3. **Performance y optimización** — Queries N+1, índices faltantes, bundle size del frontend, lazy loading, caching, connection pooling, rendering del servidor vs cliente
4. **Resiliencia y manejo de errores** — ¿Qué pasa cuando falla MercadoPago? ¿Cuando Supabase tiene downtime? ¿Cuando un job de pg-boss falla? Retry policies, circuit breakers, fallbacks, DLQ handling
5. **Concurrencia y consistencia de datos** — Race conditions en reservas, doble cobro, overbooking, transacciones atómicas, locks
6. **Infraestructura y deploy** — CI/CD, environments (staging/prod), migrations strategy, rollback plan, monitoring, alerting, logs centralizados
7. **Escalabilidad** — Connection limits de Supabase, límites de Vercel (serverless cold starts, timeouts de 10s en hobby/30s en pro), estrategia de caching, CDN, estrategia de escalado horizontal
8. **Observabilidad** — Métricas de negocio (reservas/hora, tasa de conversión, errores de pago), métricas técnicas (latencia P50/P95/P99, error rate, throughput), dashboards, alertas
9. **Testing** — Cobertura actual real, gaps en testing, tests de carga, tests de contrato, mutation testing, visual regression testing
10. **Deuda técnica** — Code smells, abstracciones incorrectas, módulos acoplados, dependencias desactualizadas, TODOs/FIXMEs en el código
11. **UX/Accesibilidad** — Responsive design, performance percibida (skeleton loading, optimistic updates), accesibilidad WCAG, internacionalización futura
12. **Legal/Compliance** — Términos y condiciones, política de privacidad, manejo de datos personales (Ley 25.326 de Argentina), facturación electrónica (AFIP), retención de datos
13. **Operaciones y soporte** — Admin tools, feature flags, kill switches, runbooks para incidentes, documentación operativa
14. **Estrategia de datos** — Backups, disaster recovery, RPO/RTO, data retention policies, analytics pipeline
15. **Integraciones de terceros** — Health checks de MercadoPago/Supabase/Resend/Upstash, manejo de cambios en APIs externas, contratos de integración

## Al final del documento, incluí:

1. **Matriz de riesgo** — Los 10 riesgos técnicos más grandes ordenados por (probabilidad × impacto), con mitigación propuesta.
2. **Camino mínimo a producción** — La secuencia exacta de acciones P0 que debo completar, en orden, para poder hacer el primer deploy a producción con confianza.
3. **Estimación realista de esfuerzo** — Cuánto tiempo estimas que tomaría completar solo las P0 y P1, asumiendo que un agente de IA + un desarrollador senior trabajan en conjunto.
4. **Comparativa con ATC Sports** — Tabla de funcionalidades: qué tiene ATC, qué tiene TurnoGol, qué le falta.

No te limites en extensión. Prefiero un documento de 50 páginas que cubra todo a uno de 5 que deje gaps. Esto va a ser mi biblia técnica para los próximos meses.
```

## `---END---`

---

## Notas de uso

- **Dónde ejecutarlo:** En Claude Code (terminal), dentro del directorio raíz de `TurnoGol`
- **Modelo:** Opus 4.7 con extended thinking (superpowers/skill activado)
- **Tiempo estimado:** Este prompt va a hacer que Opus piense mucho y lea muchos archivos. Esperá entre 15-40 minutos dependiendo del tamaño del codebase
- **Resultado:** Un documento exhaustivo que te sirve como roadmap técnico real
- **Tip:** Si el output se corta, pedile "Continuá desde donde cortaste" — Opus mantiene el contexto
