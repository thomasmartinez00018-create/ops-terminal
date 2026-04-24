# OPS Terminal — Guía de Deploy a la Nube

> Arquitectura v2.0: Electron thin shell → Vercel (frontend) → Railway (backend) → Neon (Postgres).
> Costo total: **$5 USD/mes** (solo Railway Hobby). Frontend y DB en free tier profesional.

---

## 0. Stack final

```
┌─────────────────┐   HTTPS    ┌──────────────────┐   HTTPS   ┌────────────────┐
│ Electron .exe   │ ─────────▶ │ Vercel (Vite SPA)│ ────────▶ │ Railway (API)  │
│ (thin shell)    │            │ www.ops-terminal │           │ Express+Prisma │
└─────────────────┘            │ .com.ar          │           └───────┬────────┘
                                └──────────────────┘                   │
                                                                        ▼
                                                              ┌──────────────────┐
                                                              │ Neon (Postgres)  │
                                                              │ free 0.5 GB      │
                                                              └──────────────────┘
```

Todo el tráfico es HTTPS. El .exe ya NO levanta un backend local — es un wrapper que
carga la URL cloud. Eso elimina de raíz los falsos positivos de antivirus por puertos
locales, el drama del firewall, y los problemas de "no se ve desde otro dispositivo".

---

## 1. Neon Postgres (2 min)

1. https://neon.tech → "Sign up with GitHub"
2. **Create Project** → region `aws-us-east-1` (más cercano a Railway us-east) →
   project name: `ops-terminal` → database name: `ops`
3. Copiar el **Connection String** que te da. Pinta así:
   ```
   postgresql://ops_owner:xxxxx@ep-xxxx-xxxx.us-east-1.aws.neon.tech/ops?sslmode=require
   ```
4. Guardarlo — se usa en Railway como `DATABASE_URL`.

**Por qué Neon:** 0.5 GB free (sobra para años), branching estilo git, autoscaling,
pooler incluido, backups automáticos. Sin tarjeta.

---

## 2. Railway (5 min)

1. https://railway.app → "Login with GitHub"
2. **Upgrade a Hobby ($5/mo)** — obligatorio para que no duerma. (El free trial dura
   solo $5 en crédito y después frena.)
3. **New Project → Deploy from GitHub repo** → seleccionar `ops-terminal`
4. Railway detecta el `railway.json` en la raíz y el `Dockerfile` en `packages/backend`.
5. Abrir **Settings → Root Directory** → dejar en blanco (el Dockerfile se resuelve
   solo desde la raíz).
6. **Variables** → agregar:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | el connection string de Neon del paso 1 |
   | `JWT_SECRET` | string random largo — generar con `openssl rand -hex 48` |
   | `NODE_ENV` | `production` |
   | `ALLOWED_ORIGINS` | `https://www.ops-terminal.com.ar,https://ops-terminal.com.ar` *(dominio oficial — agregar las URLs `.vercel.app` también si querés mantener previews)* |
   | `GEMINI_API_KEY` | tu key de Google AI Studio (para el scanner de facturas) |
   | `PORT` | Railway lo inyecta solo — no tocar |

7. **Deploy**. El build-log muestra:
   - `npm ci --include=dev` (≈60s)
   - `prisma generate`
   - `tsc`
   - Imagen final runtime
   - Al arrancar: `prisma migrate deploy` → `node dist/server.js`
8. Una vez verde, **Settings → Networking → Generate Domain**. Va a darte algo como
   `ops-terminal-production.up.railway.app`. Copiarlo.
9. Verificar: abrir `https://ops-terminal-production.up.railway.app/api/health`
   → tiene que devolver `{"status":"ok","database":"ok","time":"..."}`

**Troubleshooting:**
- Si el deploy falla en `prisma migrate deploy` con `P1001: Can't reach database` →
  revisar `DATABASE_URL` (debe incluir `?sslmode=require` al final).
- Si devuelve 502 después de "Healthy" → mirar `Deployments → View Logs`. Los crashes
  quedan ahí.

---

## 3. Vercel (3 min)

1. https://vercel.com → "Sign up with GitHub"
2. **Add New → Project** → importar `ops-terminal`
3. **Root Directory** → click "Edit" → `packages/frontend`
4. **Framework Preset** → `Vite` (auto-detectado)
5. **Environment Variables**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://ops-terminal-production.up.railway.app` (del paso 2.8) |

6. **Deploy**. Primera build tarda ~2 min.
7. Una vez verde, Vercel te asigna `https://ops-terminal-XXX.vercel.app` (o similar).
8. **Volver a Railway** → Variables → editar `ALLOWED_ORIGINS` y poner la URL real
   de Vercel + el dominio custom (`https://www.ops-terminal.com.ar`). Redeploy automático.
9. Abrir la URL del dominio → tenés que ver la pantalla de login.

**Dominio oficial:** `www.ops-terminal.com.ar` (vinculado en Vercel → Settings →
Domains). El cert HTTPS lo emite Vercel automáticamente con Let's Encrypt.
Si en algún momento agregás otro dominio, sumarlo a `ALLOWED_ORIGINS` en Railway.

---

## 4. Migrar datos del cliente (SQLite → Neon)

Esto se hace **una sola vez** para trasladar lo que el cliente ya tiene en su
instalación vieja de OPS Terminal.

1. Pedirle al cliente que mande el archivo `stock.db`. En su PC Windows está en:
   ```
   %APPDATA%\OPS Terminal\stock.db
   ```
   (Pegarlo en la barra del Explorer de Windows y presionar Enter.)
2. Guardar ese archivo localmente, ej. `~/Downloads/stock.db`.
3. Desde `packages/backend`:
   ```bash
   export SQLITE_PATH=~/Downloads/stock.db
   export DATABASE_URL="postgresql://ops_owner:xxxxx@ep-xxxx.neon.tech/ops?sslmode=require"
   npx tsx scripts/migrate-sqlite-to-postgres.ts
   ```
4. El script imprime tabla por tabla cuántas filas insertó. Si una tabla destino ya
   tiene datos, la saltea sin duplicar — es idempotente.
5. Verificar en la app cloud: login con el usuario del cliente y revisar productos,
   movimientos, etc.

**Sobre PINs:** los PINs viejos están en texto plano en la SQLite. El script los
copia tal cual. La primera vez que cada usuario se loguea en la versión cloud, el
backend los re-hashea con bcrypt automáticamente. Transparente.

---

## 5. Rebuild del instalador Electron (3 min)

El nuevo `.exe` es un thin shell: apunta a `https://www.ops-terminal.com.ar` por
default. Pesa ~80 MB (vs 350 MB de la v1.x).

1. En local:
   ```bash
   git add -A
   git commit -m "feat: v2.0 cloud shell"
   git push
   git tag v2.0.0
   git push --tags
   ```
2. El tag dispara `.github/workflows/build-win.yml` en GitHub Actions.
3. ~5 min después → **Releases** del repo → descargar `OPS-Terminal-Setup-2.0.0.exe`.
4. Instalarlo en la PC del cliente. Al abrir:
   - Splash de carga (mientras chequea conectividad)
   - Si hay internet → carga `https://www.ops-terminal.com.ar`
   - Si no hay internet → pantalla de error prolija con el path del log

**Override de URL (staging):** se puede construir el instalador apuntando a otra URL
definiendo `OPS_CLOUD_URL` como GitHub Actions variable (Repo → Settings → Variables
→ Actions).

---

## 6. Costos reales

| Servicio | Tier | Costo |
|---|---|---|
| Neon Postgres | Free (0.5 GB, 100h compute/mes) | $0 |
| Vercel | Hobby (100 GB bandwidth, unlimited requests) | $0 |
| Railway | Hobby ($5 crédito incluido) | **$5/mo** |
| Dominio `ops-terminal.com.ar` | renovación anual | ~$15 USD/año |
| **Total** | | **$5 USD/mes + dominio** |

Si en algún momento el cliente crece y Neon se queda corto, pasar a Neon Scale
($19/mo, 10 GB) sin migración — solo upgrade en el dashboard.

---

## 7. Rotación de credenciales

Buenas prácticas que recomiendo hacer ahora, antes de entregarle el producto al cliente:

- **JWT_SECRET:** regenerar cada 6 meses (forza re-login pero no pierde datos).
- **DATABASE_URL:** Neon permite rotar la password desde el dashboard.
- **GEMINI_API_KEY:** revisarla en Google AI Studio cada tanto, tiene quota diaria.
- **Backups:** Neon hace snapshots automáticos. Para paranoia extra: `pg_dump` semanal
  con un cron local.

---

## 8. Monitoreo

- **Railway** muestra CPU/RAM/requests en vivo en su dashboard.
- **Vercel** muestra tráfico y Core Web Vitals.
- **Neon** muestra queries slow + tamaño de DB.
- Para alertas: Railway tiene integraciones con Discord/Slack en Settings → Integrations.

---

## 9. Rollback

Si algo explota en prod:

```bash
# En Railway: Deployments → click un deployment anterior → "Redeploy"
# En Vercel: Deployments → "Promote to Production" en uno viejo
# En local: git revert + push
```

Los datos quedan en Neon independientemente de rollbacks de app — Postgres no se
toca salvo que corras una migration destructiva.

---

## 10. Checklist final antes de entregar al cliente

- [ ] Neon DB creada con SSL
- [ ] Railway deployado con todas las envs + healthcheck verde
- [ ] Vercel deployado apuntando a Railway
- [ ] `ALLOWED_ORIGINS` en Railway incluye `https://www.ops-terminal.com.ar` + `https://ops-terminal.com.ar`
- [ ] Migración de datos corrida, verificada en la UI
- [ ] Usuario admin puede loguearse con el PIN viejo
- [ ] Instalador v2.0.0 generado en GitHub Releases
- [ ] Instalado en la PC del cliente, probado en la WiFi del restaurante
- [ ] Probado desde un celular o notebook en OTRA red — tiene que funcionar igual

Listo.
