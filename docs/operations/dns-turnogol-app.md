# DNS de turnogol.app — inventario y migración a Cloudflare

Fotografía tomada el **2026-07-31**, antes de mover el DNS a Cloudflare. Existe
para una sola cosa: poder verificar, después de la mudanza, que **no se perdió
ningún registro**.

> **Verificado 2026-08-27:** la migración a Cloudflare ya ocurrió — los
> nameservers de `turnogol.app` son `olivia.ns.cloudflare.com` /
> `keenan.ns.cloudflare.com`, y los cinco registros de la tabla de abajo
> (A, CNAME, DKIM, SPF, MX) siguen respondiendo iguales contra `8.8.8.8`: no se
> perdió ninguno.
>
> **§"Orden seguro" paso 6/7 (dominio personalizado `media.turnogol.app` en
> R2): SÍ está configurado — corregido 2026-08-27, la auditoría de docs de hoy
> lo había marcado como pendiente por un falso negativo de DNS.**
> `nslookup -type=CNAME media.turnogol.app` no devuelve nada porque Cloudflare
> aplana (flattening) el CNAME de un registro proxeado (nube naranja) — no expone
> el CNAME real a una consulta que pide ese tipo específico. Verificado en vivo
> con el tipo correcto y con HTTP:
> `nslookup -type=A media.turnogol.app 8.8.8.8` → `172.67.141.253` / `104.21.87.62`
> (IPs de borde de Cloudflare) y `curl -I https://media.turnogol.app/` → `404
> Not Found` con `Server: cloudflare` — el 404 es el de R2 devolviendo "no existe
> el objeto", no un error de DNS ni de Cloudflare sin backend (hoy no hay fotos
> subidas, así que un 404 es lo esperado). `R2_PUBLIC_BASE_URL` sí corre sobre
> dominio propio. Lección para el próximo chequeo de DNS de un registro
> proxeado por Cloudflare: usar `-type=A`/`-type=AAAA` o `curl`, nunca
> `-type=CNAME` a secas — dio falso negativo acá y en la propia sugerencia de
> comando de este doc (línea ~83, ver abajo).

## Dónde está hoy

| | |
|---|---|
| Registrador | Namecheap |
| Nameservers | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` |
| Hosting web | Vercel |
| Email transaccional | Resend (que por debajo usa Amazon SES, región `sa-east-1`) |

## Los registros que HAY que preservar

Consultados contra `8.8.8.8`, no contra el resolver local.

| Nombre | Tipo | Valor | Para qué |
|---|---|---|---|
| `turnogol.app` | A | `216.198.79.1` | El sitio |
| `www.turnogol.app` | CNAME | `cname.vercel-dns.com` | El sitio |
| `resend._domainkey.turnogol.app` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC2stiZryWMSoCGNgc3S3+HRw7ddL2Wl9H+hvVkbRvqCXQtITGptTzc5wEaKSt3q+IKaj9nz/xDdY5fhgOq5Q++bIuxSJm0/y+KCjR+dm/8PSTbj8y6WOpwdh0vj+L/9DFN4ub14CIAEsj0SgQALmep2yek+03MLMzzH4Y9zK4KnwIDAQAB` | **DKIM — firma los mails** |
| `send.turnogol.app` | TXT | `v=spf1 include:amazonses.com ~all` | **SPF — autoriza a SES a enviar** |
| `send.turnogol.app` | MX | `10 feedback-smtp.sa-east-1.amazonses.com` | **Rebotes y quejas** |
| `_dmarc.turnogol.app` | TXT | `v=DMARC1; p=none;` | Política DMARC |

**Los tres marcados en negrita son el correo.** Si alguno no sobrevive a la
mudanza, dejan de salir los mails de confirmación de alta, de recuperar
contraseña y de aviso de fin de prueba — o sea, se corta el onboarding entero y
sin ningún error visible en la app. Ese es el riesgo real de este cambio, no el
sitio.

## Por qué se migra

R2 exige que el dominio esté gestionado por Cloudflare para poder usar un
**dominio propio** (`media.turnogol.app`) como URL pública de las fotos. La
alternativa es la URL `pub-xxxx.r2.dev`, que Cloudflare limita por tasa y
desaconseja explícitamente para producción.

Conviene hacerlo **antes** de que existan fotos: `courts.photos` guarda URLs
**absolutas**, así que cambiar de dominio más adelante deja huérfanas todas las
imágenes ya subidas y obliga a una migración de datos. Hoy hay cero fotos.

## Orden seguro

1. Agregar `turnogol.app` como sitio en Cloudflare (plan Free). Cloudflare
   escanea el DNS actual e importa lo que encuentra.
2. **Contrastar la lista importada contra la tabla de arriba, registro por
   registro.** Este es el paso que evita el apagón de mails. El escaneo de
   Cloudflare no siempre trae todo.
3. Poner en **DNS-only (nube gris)** los registros que apuntan a Vercel: el `A`
   del apex y el `CNAME` de `www`. Cloudflare los proxea (nube naranja) por
   defecto, y proxear por encima de Vercel trae problemas de SSL y doble proxy.
   Los TXT y MX no son proxeables, así que esos no corren riesgo.
4. Recién entonces, cambiar los nameservers en Namecheap por los que da
   Cloudflare.
5. Esperar la propagación y **verificar el correo de verdad**: pedir un reset de
   contraseña y confirmar que llega. Que Resend siga diciendo "Verified" no
   alcanza — puede tardar en detectar la caída.
6. En R2 → `turnogol-media` → Dominios personalizados → agregar
   `media.turnogol.app`. Cloudflare crea el CNAME solo.
7. En Vercel (Production): `R2_PUBLIC_BASE_URL=https://media.turnogol.app` y
   redeploy.

## Cómo verificar después

```bash
nslookup -type=TXT resend._domainkey.turnogol.app 8.8.8.8
nslookup -type=TXT send.turnogol.app 8.8.8.8
nslookup -type=MX  send.turnogol.app 8.8.8.8
nslookup -type=A   turnogol.app 8.8.8.8
nslookup -type=CNAME www.turnogol.app 8.8.8.8
# Para media.turnogol.app (proxeado, nube naranja): -type=CNAME da falso negativo
# por CNAME flattening de Cloudflare. Usar -type=A o curl -I en su lugar:
nslookup -type=A media.turnogol.app 8.8.8.8
curl -I https://media.turnogol.app/
```

Los valores tienen que coincidir con la tabla. Y el chequeo que de verdad
cuenta: que llegue un mail.
