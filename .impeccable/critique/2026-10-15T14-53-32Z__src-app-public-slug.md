---
target: portal del jugador (página del complejo y flujo de reserva)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Lazar\\Documents\\github\\TurnoGol-wt-portal\\src\\app\\(public)\\[slug]"
timestamp: 2026-10-15T14-53-32Z
slug: src-app-public-slug
---
# Crítica del portal del jugador (estado actual, `43165ca8`)

Método: dos agentes separados (A: revisión de diseño · B: detector y navegador). Desvío: el harness no dejó que B guardara su informe en un archivo y sus hallazgos llegaron al orquestador antes de que A terminara; A no los vio.

Cobertura: home, /explorar y la página de El Vagón en producción (anónimo, sin tocar /reservar ni /disponibilidad, que miden el embudo); el resto en Storybook (390 y 1280, claro y oscuro). /reservar, /ingresar y /verify no se vieron como página entera: se reconstruyeron con historias y código. Alcance: todo el portal (F3); el destino guardado es la página del complejo, centro del flujo.

## Puntaje (Nielsen)

| # | Heurística | Pts | Lo principal |
|---|---|---|---|
| 1 | Estado del sistema | 3 | Hay carga y cuenta regresiva; Google sale sin aviso, cancelar sin seña cierra mudo, "Señando 4:12" sin leyenda |
| 2 | Lenguaje del jugador | 3 | Voseo bien; "declaración jurada", "enlace mágico", "Señando" |
| 3 | Control y libertad | 3 | "Ingresar" del header pierde el turno elegido; "Revisá tu email" sin reenvío |
| 4 | Consistencia | 2 | Tres botones primarios verdes distintos; ingreso siempre oscuro; cuatro verbos para reservar |
| 5 | Prevención de errores | 2 | La home elige la cancha por vos (puede ser F7 si buscabas F5); Google deshabilitado sin explicación visible |
| 6 | Reconocimiento | 2 | Encabezados de cancha que se van al scrollear; 65 botones "Reservar" iguales |
| 7 | Flexibilidad | 2 | Píldoras "Libre hoy" a un toque, bien; no hay "repetir turno" |
| 8 | Estética y foco | 2 | 7 bloques antes de reservar; QR de un tercio de pantalla en el éxito |
| 9 | Recuperación de errores | 2 | /verify y cancelar mejoraron; siguen 40 de 70 textos que no dicen qué hacer |
| 10 | Ayuda | 1 | Nada de la política de cancelación antes de confirmar; el WhatsApp del pie es de TurnoGol, no del complejo |
| | **Total** | **22/40** | Aceptable |

## Especificidad

**Revisión (A):** 5/10, reconocible pero intercambiable. Propio: la Archivo itálica, las líneas de cancha, el voseo y el titular de la home con km reales y píldoras "Libre hoy 12:00 13:00", la única pantalla que habla de jugar. Intercambiable: hero con buscador, "Así de simple 01/02/03", ficha de local con tabla de botones, manchas verdes y vidrio. Falta: el partido y el grupo, el formato como dato para decidir, la página del complejo como casa del complejo, y la vista previa del link en WhatsApp (primer pantallazo real; hoy dice "El vagón Deportivo , Lujan").

**Detector (B):** CLI con 56 hallazgos en 21 archivos: 2 primarios (`border-accent-on-rounded` en `TenantCard.tsx:45` y `explorar/loading.tsx:33`) y 54 avisos de tamaño y color fuera de la rampa de DESIGN.md (21 en `NearbyPanel.tsx`). Navegador: 17 hallazgos en 5 historias en claro y 15 en oscuro: halos radiales en 4 de 5, textos de 10 px en Mis reservas (`MisReservasView.tsx:244,250`), "Tu actividad" a 3,6:1 en claro (`MisReservasView.tsx:166-167`), tarjeta dentro de tarjeta en la grilla (`AvailabilityGrid.tsx:304-305` dentro de `(perfil)/page.tsx:92`), sombra de color en el CTA de /verify (`VerifyView.tsx:139`).

Coinciden: las manchas de A son los halos de B; los 7 bloques son la tarjeta en tarjeta. B vio lo que A no: contraste, 10 px y 54 tamaños fuera de rampa (el mundo actual nunca se aplicó parejo). Falsos positivos: `#000` de tres máscaras (solo alfa), texto con degradé (aprobado el 2026-09-27), tres 16 px que DESIGN.md menciona en prosa. Sin overlay visible: la inyección corrió en un navegador sin pantalla.

## Impresión general

La reserva está bien hecha por dentro y mal puesta por fuera: lo que llega por el link es una ficha de local con la reserva a 1.600 px, y lo que mejor funciona (las píldoras "Libre hoy") vive en la home, donde el jugador del link no pasa. La oportunidad: llevar esa interacción al centro de la página del complejo.

## Qué funciona

1. Píldoras "Libre hoy" de la home: hora libre a un toque, directo a reservar (`NearbyPanel.tsx`).
2. Tono al cancelar y en los errores de /verify: consecuencia concreta ("Perdés la seña de $X", "No pasó nada").
3. Reserva confirmada: hechos primero, un titular; filtro de Fútbol 4 a 11 en /explorar.

## Problemas prioritarios

- **[P1] La reserva queda enterrada y la grilla no entra en el celular.** A 390 px no hay "Reservar" en la primera pantalla; la grilla empieza a 1.593 px, muestra 2,4 de 5 canchas, 65 botones iguales y encabezados que se van. Arreglo: horarios libres de hoy arriba; elección en celular que escale a 10 canchas. Comando: shape → layout → adapt.
- **[P1] El formato desaparece del camino de reserva.** `PublicCourt` no trae `format` (`public.service.ts:147-153`); /reservar, éxito y Mis reservas muestran solo el nombre; El Vagón emparcha con "f7" en el nombre; las píldoras de la home toman la primera cancha libre por hora (`nearby.ts:82-90`). Arreglo: formato en cada paso (sumar un campo a una lectura, no lógica). Comando: clarify → layout.
- **[P1] El ingreso es un muro en el momento de más intención.** "Continuar con Google" a ~940 px, debajo de tres campos y el +18, deshabilitado con solo un `title` (`LoginGate.tsx:158-163`). Si Google no entra desde el navegador de Instagram (inferido), no hay camino rápido. Arreglo: Google y email del mismo peso, +18 en una fila arriba (ADR-012), email primero en navegador interno, reenvío. Comando: harden → clarify. P0 si se confirma el bloqueo.
- **[P2] El final no aprovecha el mejor momento.** Seis acciones, dos verdes compitiendo; "Compartir" manda "¿Te sumás?" con el link del complejo (`BookingSuccessExtras.tsx:60-64`); "Seguir explorando" manda a otros complejos; "Te queda 6:00 para completar el pago" a quien ya pagó (`PaymentStatusWatcher.tsx:226-231`). Comando: shape → clarify.
- **[P2] Volver cuesta lo mismo que la primera vez.** La home no reconoce al que vuelve; "Reservar de nuevo" solo en el historial; sin sesión se repite el ingreso. Arreglo: "Tu próximo turno" y "Tu complejo" en la home, "Repetir turno" en Próximos. Comando: shape → distill.

## Personas

- Celular, una mano: grilla con 2,4 canchas, Google fuera de pantalla, diálogo de cancelar arriba.
- Primera vez por el link: arriba "TURNOGOL · Explorar · Ingresar", no el complejo; tarjetas de cancha que parecen botones (`CourtCard.tsx`); el WhatsApp verde invita a preguntar.
- Casos borde: "Esperando seña" sin salida al cerrar MercadoPago; pestaña trabada si el mail abre otro navegador; JSON crudo en el 429 de /verify.
- Organizador desde Instagram: navegador interno, Google probablemente bloqueado, sin formato al elegir, comparte el complejo y no el partido.
- El que vuelve: la misma página larga, sin "repetir", ingreso completo sin sesión.

## Menores

- Espacio al final del nombre de El Vagón, visible en la vista previa del link.
- Con precios ocultos, /explorar mantiene "Precio más bajo" y el filtro de precio que dejan afuera o al fondo al que oculta; la home lo rankea más abajo (`nearby.ts:29`, `search.service.ts:170-173,206`).
- El pie muestra el WhatsApp de TurnoGol también en la página del complejo.
- /ingresar carga su foto de Unsplash por URL externa (`ingresar/page.tsx:8-9`).

## Preguntas para pensar

1. ¿Y si reservar fuera elegir "jueves 21 h · Fútbol 7", como en el WhatsApp del complejo?
2. ¿Y si la página del link fuera de verdad la casa del complejo?
3. ¿Y si toda reserva terminara convocando al grupo, el primer día de RIVAL?
