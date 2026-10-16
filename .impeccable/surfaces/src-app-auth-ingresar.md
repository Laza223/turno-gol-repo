---
version: 1
slug: "src-app-auth-ingresar"
primary_target: "src/app/(auth)/ingresar"
related_targets: ["src/app/(auth)/verify","src/app/(auth)/aceptar-terminos"]
---

# Ingreso del jugador (src/app/(auth)/ingresar, verify, aceptar-terminos)

Modo: Operate. Visitante: el jugador que toca "Ingresar" en el portal, el que vuelve del enlace del mail o de Google, y el jugador nuevo al que le falta aceptar los términos. Trabajo: entrar sin trabarse y volver a donde estaba.

Mundo: el del brief de `src/app/(public)/[slug]` (OWN-WORLD), sin cambios. Es la primera superficie que lo monta. Las pantallas del staff (`/login`, `/register`, recuperación y los estados de `/verify` del staff) no cambian.

## Decisiones (salen del brief confirmado y de la crítica del 2026-10-15)

- `/ingresar`: una columna centrada, sin la foto de Unsplash, sin halos y sin vidrio. Arriba el logo, un título y una línea de para qué sirve entrar. "Continuar con Google" y el email ("Mandame el enlace") a la vista sin scroll, los dos de 48 px a todo el ancho. En los navegadores internos (Instagram, Facebook, TikTok) va primero el email, con la aclaración de que Google puede no abrir ahí. El campo usa `border-input`. El texto del campo mide 16 px en el celular y 14 px desde 768, igual que en todos los campos (The 16px Field Rule de DESIGN.md). Enlace enviado: a qué dirección, "Reenviar" con espera y "Usar otro email". El texto no promete el envío: la action contesta igual cuando el email no tiene cuenta, para no revelar qué emails están registrados, y en ese caso no sale nada ("Si {email} tiene cuenta, te enviamos un enlace para entrar"). Debajo, el que entra por primera vez ve cómo se crea la cuenta: con Google o con su primer turno; en los navegadores internos, solo con el turno. La espera de 60 s arranca cada vez que el servidor contesta, y no después de un corte de red. `next` se respeta como hoy.
- `/aceptar-terminos`: el mismo marco. La casilla del +18 y los términos (ADR-012) y "Continuar". Si falta la casilla, se marca el error en la casilla; nada queda deshabilitado sin explicación.
- `/verify`, solo los estados del jugador (`audience: 'player'`): el mismo marco, con el título y la acción de cada código como quedaron en #419. Los estados del staff siguen como hoy.
- `PortalWorld` se monta por página (`(auth)` mezcla staff y jugador). En `/verify` se monta solo para el público jugador.
- Botones planos: sin sombra ni elevación al hover. El foco se separa con el color del fondo, sin la banda blanca en oscuro.
- Mismo comportamiento: no cambian las Server Actions, el callback, los códigos ni los tiempos. En este PR, el success de `/verify` mantiene su redirección.

## Estados y rangos

- Claro y oscuro, a 375, 390, 768 y 1280 px. Email largo: se corta sin romper el layout. Errores de la action: email inválido, demasiados intentos, sin conexión. Sin conexión, el error queda en el formulario con el email escrito, y la página no cae en el error del grupo. Botón enviando: "Enviando…", sin doble envío.
- Contratos: los encabezados que fijan las e2e y las stories (TG-HP-010, `VerifyPage.stories`, `IngresarForm.stories`) se conservan o se cambian a propósito en el mismo PR.

## Fuera

La barra y el pie del portal, y "Ingresar" con `next` en la barra (PR 2.2). El ingreso dentro de la reserva (`LoginGate`) y la vuelta directa sin `/verify` (PR 2.3).
