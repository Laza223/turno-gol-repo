# Métricas de activación: A1 / A2 / A3

> Definiciones operativas (D7 del 2026-09-02) y cómo se miden **hoy, sin código nuevo**. Cuando una medición requiera instrumentación, se anota como excepción válida del freeze y se decide en `10-aprendizajes.md` antes de programar.

## A1 — Activación del complejo

**Definición:** TurnoGol entró realmente en la operación. Se cumple cuando, en una misma semana: (a) todos los fijos están cargados como abonados, (b) el staff (dueño o encargado) abrió la grilla ≥5 días, (c) la caja se cerró en TurnoGol ≥5 días, (d) los pagos de fijos de la semana tienen estado marcado.

**Cómo se mide hoy:**
- Abonados cargados: super-admin → detalle del tenant → pestaña Actividad / o preguntar; también visible en `/abonados` impersonando.
- Grilla abierta por día: eventos `grid.*` en `analytics_events` (agrupar por día y tenant; no tienen persona, solo tenant).
- Caja cerrada: eventos `cashflow.close.confirmed` por día, o filas de `daily_cash_closes` del tenant.
- Pagos de fijos marcados: sesiones de abonado con `deposit_status`/pago registrado en la semana (vista `/abonados`).

**Registro:** fecha en que se cumplió por primera vez → CRM `etapa = activado-A1` + panel.

## A2 — Activación del jugador

**Definición:** primera reserva online real hecha por un **jugador desconocido** (no fijo, no conocido del dueño, no staff, no founder) en un complejo de terceros.

**Cómo se mide hoy:** evento `activation.first_online_booking` (booking con `created_by_staff IS NULL`) y, para el "desconocido", preguntar al dueño quién es (el sistema no sabe si es conocido). Se registra: fecha, cómo llegó el jugador (link de bio, QR, `/explorar`, boca a boca), con o sin seña.

**Lectura:** si A2 no ocurre en 30 días en P1, **no invalida el North Star**; es diagnóstico: ¿el link circuló? ¿hubo `profile.viewed` / `checkout.viewed` sin reserva? ¿la seña frenó?

## A3 — Activación de red

**Definición:** un jugador que entró al ecosistema por un complejo usa TurnoGol para descubrir y reservar en **otro** complejo sin que ese complejo original ni el segundo le hayan mandado el link. Es el inicio real de distribución.

**Cómo se mide hoy (proxy, no exacto):** consulta de solo lectura cross-tenant (pool worker, desde super-admin o script) = jugadores con reservas confirmadas en ≥2 tenants distintos, ordenadas por fecha; la segunda reserva es candidata a A3. El "sin link" **no es medible** hoy: `analytics_events` no guarda identidad del jugador (por diseño, sin PII) y no hay referrer/UTM. Se cierra a mano preguntando al jugador (email de confirmación) o al segundo complejo.

**Cuándo instrumentar:** recién cuando exista el primer candidato real. Hasta entonces, proxy + pregunta.

## Tabla de seguimiento (copiar al panel los viernes)

| Complejo | A1 fecha | Días grilla/sem | Días caja/sem | Fijos con estado % | A2 fecha | A2 canal | Seña on | A3 candidato |
|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | |
