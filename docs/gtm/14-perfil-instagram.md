# 14 — Perfil de Instagram @turnogol: kit de setup completo

> **Doctrina (red team §13-18, vigente):** el perfil es **sala de exhibición, no motor de demanda**. Lo juzga UN dueño escéptico que te stalkea después del primer contacto por WhatsApp — no el algoritmo. Todo CTA termina en WhatsApp: "el perfil de IG es un pasillo hacia WhatsApp, nunca una sala de espera". La métrica son dueños al DM/WA; seguidores y likes son anti-métricas.

Estado al 2026-07-30: @turnogol registrado ✅, logo cargado ✅, 9 seguidores, bio vacía ("Turnogol"). Este doc es el checklist para dejarlo presentable en ~30 minutos de app.

## Evidencia competencia (verificada 2026-07-30)

| Cuenta | Seguidores | Bio | Lectura |
|---|---|---|---|
| @atcsports.io | 14.4K | "Tu próximo partido ⚽ +4000 canchas de fútbol, pádel y más. Descargá la app" | 100% B2C jugadores. **No compite por el dueño en IG** — el terreno B2B está libre |
| @clubo_ar | 1.6K | "CLUBO \| Plataforma digital para predios. Profesionalizá tu predio y hacelo crecer 🚀 Reservas automáticas, cobros y gestión de cantina 💻 Probá 1 mes gratis 👇 📍Ar" | El patrón B2B correcto: qué es + features + oferta + flecha al link. Pero usa vocabulario de oficina ("Plataforma", "Profesionalizá") — nuestra bio habla idioma mostrador (doc 03) |

Best practices 2026 que aplican: IG **indexa nombre + bio + categoría como buscador** → keywords en el campo nombre, no solo en el username; bio = quién ayudás + qué hacés + UNA acción; botones de contacto nativos; destacadas como menú permanente; coherencia visual de grilla.

## Checklist de setup (en orden, en la app)

### 1. Cuenta profesional + categoría
- [ ] Configuración → Tipo de cuenta → **Cuenta profesional → Empresa**.
- [ ] Categoría: **Software** (queda visible bajo el nombre e indexa en búsqueda).
- [ ] Botones de contacto: **WhatsApp** (botón nativo) + email de contacto.

### 2. Nombre (campo display — máx 30 caracteres, indexa en búsqueda)
```
TurnoGol | Complejos de Fútbol
```
(30 exactos. El username ya dice "turnogol"; este campo es donde te encuentra el dueño que busca "complejos de fútbol".)

### 3. Bio (máx 150 caracteres — DECISIÓN DEL FOUNDER 2026-07-30: doble audiencia)
```
Reservá tu cancha online ⚽
¿Tenés un complejo? Cobrá señas por MercadoPago
👇 30 días gratis
```
- Cumple la fórmula experta 2026 (Sked/TrueFuture/AgencyHelix): L1 qué+para quién · L2 diferenciador · L3 un solo CTA con 👇. Sin repetir el nombre (ya aparece en username y campo nombre).
- **Divergencia documentada con la doctrina red team** (perfil solo-dueño): Lazar eligió hablarle también al jugador en L1. Consecuencia: el link 2 (`turnogol.app`) es el destino que cumple la promesa de L1; el link 1 (WhatsApp) cumple la de L2.
- "30 días gratis" = claim VERDE (verificado en `register/page.tsx`).

### 4. Links (IG permite hasta 5 — usar 2, en este orden)
1. **WhatsApp con mensaje precargado calificador** (el link principal, primero):
   `https://wa.me/5492323346976?text=Hola!%20Tengo%20un%20complejo%20y%20quiero%20ver%20c%C3%B3mo%20funciona%20TurnoGol.%20Tengo%20__%20canchas`
2. `https://turnogol.app`

Cuando exista la demo larga en YouTube (E9 del red team), entra como link 3.

### 5. Foto de perfil
Logo actual. Verificar en el celu que sea legible en el círculo chico (40px): fondo sólido, sin texto fino. Mismo avatar en toda red futura (consistencia de marca).

### 6. Destacadas (4 al inicio, covers con colores del branding)
| Destacada | Qué va adentro | Fuente |
|---|---|---|
| **Cómo funciona** | Screen-records REALES: flujo de reserva del jugador, el push sonando | R13 / R11 de [11](./11-contenido-viral-ig.md) |
| **Señas** | La objeción #1 respondida: "guardar es señar", "¿y si no paga? se libera solo" | R22 + R27 |
| **Tu página** | El portal público `turnogol.app/tu-complejo` navegado | R23 |
| **Precios** | Placas de los 3 planes (55/85/115k — públicos en /precios) | plans-data.ts |

**"Casos" NO se crea hasta tener el piloto real con permiso escrito** (§8 de doc 11 — regla dura: cero testimonios inventados).

### 7. Fijados (3) y grilla inicial (12 piezas evergreen)
- **Fijados**: P1 qué-es (base R16, sin hype de "lista de espera") · P2 el sonido (R11) · P5 tu página (R23).
- **Grilla — orden de producción** (prioridad del red team §16): R13 → R11 → R23 → R15 → R2 → resto de los 15 guiones mantenidos + 3 fotos/placas simples (logo + frase, portal, planes).
- Cadencia post-setup: **2 piezas/semana**, no diaria. 12 piezas buenas y fijadas valen igual que 180 diarias para el visitante que importa.

### 8. Higiene y operación
- Seguir SOLO cuentas del nicho: los 100 complejos scoreados del corredor ([02-icp.md](./02-icp.md)) + @atcsports.io y @clubo_ar para monitoreo. Nada de follow masivo.
- Responder TODO comentario y DM en <24h — el que escribe es un lead, va al CRM de [05-funnel.md](./05-funnel.md) con origen `ig`.
- Al sheet de [08](./08-plan-7-30-90.md) van: DMs de dueños, chats de WA iniciados desde la bio, visitas al perfil. Seguidores/likes no deciden nada.

## Primer post (logo solo) — caption de lanzamiento

> Decisión del founder 2026-07-30: posicionar como PLATAFORMA de gestión total, tono ambicioso. Claims chequeados contra la tabla VERDE/ROJO de [11 §9](./11-contenido-viral-ig.md): visión y futuro sí, escala inventada no.

```
Llegó TurnoGol ⚽

La plataforma de gestión total para complejos de fútbol de Argentina.

Nació para una sola cosa: que el fútbol amateur funcione como merece. Sin cuadernos, sin "¿me guardás?", sin turnos colgados.

🏟️ Para el complejo:
— Reservas online 24/7 con seña por MercadoPago, directo a tu cuenta
— Grilla en vivo, caja, cantina y métricas en un solo lugar
— Tu propia página: turnogol.app/tu-complejo

⚽ Para los jugadores:
— Ves los horarios reales, elegís y señás desde el celu
— Sin llamadas, sin esperas, sin bajar ninguna app

Esto recién empieza. Estamos sumando a los primeros complejos del país, uno por uno, configurados personalmente.

¿Tenés un complejo? Probalo 30 días gratis, sin tarjeta 👉 link en la bio.

#TurnoGol #ComplejosDeFutbol #Futbol5 #ReservasOnline #FutbolArgentino
```

- Alt text del post (accesibilidad + SEO): "Logo de TurnoGol, plataforma de gestión y reservas online para complejos de fútbol en Argentina".
- Fijar este post apenas publicado (primer fijado hasta que existan los reels).
- Primera hora: responder todo comentario (señal al algoritmo + cada comentario de dueño es un lead).

## Verificación
1. Aplicar el checklist en la app (~30 min; falta solo el número de WA).
2. Abrir `instagram.com/turnogol` en incógnito: bio, nombre, categoría y links visibles.
3. Buscar "turnogol" y "complejos de fútbol" en el buscador de IG desde otra cuenta: el perfil aparece con el nombre nuevo.
