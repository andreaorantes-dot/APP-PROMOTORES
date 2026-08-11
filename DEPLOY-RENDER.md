# Desplegar en Render (gratis, 24/7, HTTPS y link público)

Render sirve la app en `https://<tu-servicio>.onrender.com` con **HTTPS
automático** (necesario para el GPS en los teléfonos) y despliega desde GitHub
leyendo `render.yaml`. Los promotores solo reciben ese link, entran desde
Safari/Chrome y lo instalan como PWA.

> El repositorio ya está inicializado y con un commit inicial. El `.gitignore`
> está verificado: **no** se suben `.env`, los CSV con contraseñas, las
> credenciales de Google ni la base de datos.

---

## Paso 1 — Subir el código a GitHub

Necesitas una cuenta de GitHub. Crea un repositorio **vacío** (sin README) y
sube el código. Dos formas:

**Opción con la CLI de GitHub (`gh`):**
```bash
cd "APP PROMOTORES"
gh repo create promotores-app --private --source=. --remote=origin --push
```

**Opción manual:** en github.com → **New repository** → nombre `promotores-app`
→ **Create**. Luego, en la carpeta del proyecto:
```bash
git remote add origin https://github.com/<TU-USUARIO>/promotores-app.git
git push -u origin main
```

(El commit ya existe; esto solo lo sube.)

---

## Paso 2 — Crear el servicio en Render (Blueprint)

1. Entra a **https://render.com** y regístrate (puedes usar tu cuenta de GitHub).
2. **New +** → **Blueprint**.
3. Conecta tu cuenta de GitHub y elige el repo **promotores-app**.
4. Render detecta `render.yaml` y te muestra el servicio `promotores` (plan
   **Free**). Pulsa **Apply**.
5. Empieza el primer build (tarda unos minutos). Cuando termine, tendrás la URL
   pública: **`https://promotores-XXXX.onrender.com`**.

En este primer arranque aún **no hay promotores** (falta subir los CSV). Vamos a
eso.

---

## Paso 3 — Subir los datos reales como *Secret Files*

Los CSV con las contraseñas **no** están en GitHub (por seguridad). Se cargan en
Render como archivos secretos, cifrados y fuera del repo:

1. En el panel de Render, abre tu servicio → pestaña **Environment**.
2. Sección **Secret Files** → **Add Secret File**. Crea **dos**:
   - **Filename:** `Promotores.csv` → **Contents:** pega el contenido de tu
     `Promotores.csv`.
   - **Filename:** `Tiendas.csv` → **Contents:** pega el contenido de tu
     `Tiendas.csv`.
   (Render los monta en `/etc/secrets/…`, que es donde `render.yaml` ya apunta.)
3. **Save Changes.**
4. Menú **Manual Deploy** → **Deploy latest commit**. En este arranque el seed
   leerá los CSV y creará las **54 cuentas de promotor** y las **143 tiendas**.

Listo: abre la URL, inicia sesión con un **ID de promotor** y su contraseña.

---

## Paso 4 — Que los promotores lo instalen como app

Comparte el link `https://…onrender.com`. En el teléfono:

- **iPhone (Safari):** botón **Compartir** → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú **⋮** → **Instalar aplicación** / **Añadir a
  pantalla de inicio**.

Se abre en pantalla completa, como una app, sin pasar por tiendas de apps. El
navegador pedirá **permiso de ubicación**: hay que aceptarlo para el check-in.

---

## Variables de entorno (ya configuradas en `render.yaml`)

| Variable | Valor | Nota |
|---|---|---|
| `PORT` | (lo pone Render) | El servidor lo lee de `process.env.PORT`. |
| `SESSION_SECRET` | autogenerado | `generateValue: true` → Render crea un secreto seguro para el JWT. |
| `COOKIE_SECURE` | `true` | Cookie de sesión `Secure` (HTTPS). |
| `SERVE_STATIC` | `true` | Express sirve el frontend (mismo origen). |
| `CHECK_IN_RADIUS_METERS` | `100` | Radio de check-in. |
| `NEARBY_RADIUS_METERS` | `2000` | Radio de tiendas cercanas. |
| `DATABASE_URL` | `file:./dev.db` | SQLite. |
| `SEED_CSV_PATH` / `SEED_STORES_CSV_PATH` | `/etc/secrets/…` | Secret Files. |

Para conectar **Google Sheets**, añade en **Environment** (variables normales, no
secret files): `GOOGLE_SHEETS_ID` y sube el JSON del Service Account como Secret
File `service-account.json`, y define
`GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/etc/secrets/service-account.json`.

---

## Base de datos: PostgreSQL persistente (gratis)

El `render.yaml` provisiona una **PostgreSQL gratuita** de Render y conecta el
`DATABASE_URL` automáticamente (no hay que copiar credenciales). Los datos —
incluidos los **registros de visitas** — **persisten** aunque el servicio se
duerma o se reinicie. El seed es idempotente: siembra promotores/tiendas la
primera vez y luego se omite (usa `SEED_FORCE=true` si actualizas los CSV).

> El esquema se sincroniza con `prisma db push` en el arranque (sin archivos de
> migración). La BD de Postgres del plan free de Render **expira a los ~30 días**;
> para producción real, usa un plan de Postgres de pago.

## Cosas importantes del plan gratuito

- **Se duerme tras ~15 min sin uso.** La primera visita después de dormir tarda
  ~30–60 s en “despertar”. Las siguientes son instantáneas. Para que esté
  **siempre encendido**, sube al plan **Starter** de Render (de pago).

---

## Alternativa: Railway

Railway también funciona: **New Project → Deploy from GitHub** + **Add PostgreSQL**.
En *Settings* del servicio pon
`Build: npm install && npm run build && cd backend && npm install && npx prisma generate`
y `Start: cd backend && npx prisma db push --skip-generate && node prisma/seed.js && node src/server.js`.
Railway inyecta su propio `DATABASE_URL`; añade las mismas variables de entorno.
