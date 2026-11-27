---
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/hooks/**"
  - "next.config.ts"
  - "instrumentation.ts"
---

# Next, React y UI: gotchas

- **Los route groups no van en la URL**: `/admin/...` da 404 (`(admin)` no es un segmento).
- **`revalidatePath` desmonta el diálogo de éxito** si la acción saca de la lista la fila que lo renderiza (dura ~300 ms; unit, stories y `toBeVisible()` no lo ven). El diálogo va por encima de la lista, con un provider cliente si el contenedor es Server Component.
- **Radix `RadioGroup` escucha el `reset` del form** y vuelve al valor de montaje; React 19 resetea todo `<form action>` al terminar la action. Parece que no guardó. Ver `components/ui/radix-form-detach.ts`.
- **`useIsDesktop` responde "escritorio" en SSR y durante la hidratación**: no sirve para decidir qué se ve al cargar; hasta que el usuario toque, decide el CSS.
- **`instrumentation.ts` se bundlea en otro layer**: lo que registra ahí (locale de Zod, sinks) no lo ve el grafo de la app.
- **CSP con nonce + `strict-dynamic` rompe la hidratación de las páginas estáticas** (Next solo inyecta el nonce en SSR dinámico). Ya se probó y se revirtió.
- **`Collapsible` monta con `display:none`** (`forceMount` a propósito): un mapa Leaflet adentro se dibuja roto al abrir.
- **Un grid con solo `lg:grid-cols-[…]` desborda en el celular** si adentro hay `truncate`: falta `grid-cols-1`. Y al partir una vista en dos columnas, revisar los `sm:grid-cols-*` internos: miran el viewport, no el contenedor.
- **iOS hace zoom al enfocar un campo con fuente menor a 16px** y ningún headless lo reproduce.
- **Tailwind 4**: un modificador de opacidad sobre un token ya calibrado baja el contraste de AA; `scale-*` escribe la propiedad `scale`, no `transform` (la transición tiene que nombrar `scale`).
- **Zod 4**: `z.email()` valida antes que los transforms. Usar `z.string().trim().toLowerCase().pipe(z.email())`.
