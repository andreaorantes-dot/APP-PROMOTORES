# Manual de despliegue

Dos secciones: **[Local](#local)** (tu máquina, para desarrollar y probar) y
**[En servidor](#en-servidor-render)** (Render, lo que usan los promotores de
verdad). Para entender el "por qué" de cada feature, ver
[OBJETIVOS.md](OBJETIVOS.md); para la arquitectura y el contrato de API, ver
[README.md](README.md).

---

## Local

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Completa `backend/.env`. Como mínimo, para desarrollo con datos reales del
negocio (recomendado):

```bash
AUTH_SOURCE=sheet
STORES_SOURCE=sheet
VISITS_SOURCE=sheet          # solo local: tu BD no tiene actividad real
GOOGLE_SHEETS_ID=<id del documento "BBDD Promotores">
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
DATABASE_URL="file:./dev.db"
SESSION_SECRET=<genera uno: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
```

Credenciales de Google Sheets (una sola vez, se comparten entre todos los que
desarrollen este proyecto):

1. Google Cloud Console → crear un **Service Account** → generar clave **JSON**.
2. Habilitar la **Google Sheets API** en ese proyecto de Google Cloud.
3. Abrir el Sheet "BBDD Promotores" → **Compartir** → agregar el `client_email`
   del Service Account como **Editor**.
4. Guardar el JSON en `backend/credentials/service-account.json` (está en
   `.gitignore`; **nunca** se sube) y apuntar `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`
   ahí, o pegar el JSON completo en una línea en `GOOGLE_SERVICE_ACCOUNT_JSON`.

Base de datos local:

```bash
npx prisma generate
npx prisma db push       # crea backend/prisma/dev.db (SQLite)
npm run dev               # http://localhost:8080
```

> `backend/prisma/schema.prisma` tiene `provider = "sqlite"` en tu copia local
> a propósito (git no lo sincroniza, ver la nota de `skip-worktree` en
> [README.md](README.md#base-de-datos-prisma)). No lo cambies a mano.

### 2. Frontend

```bash
npm install
npm run dev    # http://localhost:5173, con proxy a :8080
```

Abre `http://localhost:5173` e inicia sesión con un ID de promotor (Sheet
"Promotores") o un usuario administrativo (Sheet "Usuarios").

### 3. Probar como un usuario real sin conocer su contraseña

Para probar el login de un promotor real sin pedirle su contraseña, hay una
receta segura y reversible (usada varias veces en este proyecto):

1. Lee su hash actual de la pestaña "Promotores" (columna Contraseña) y
   **guárdalo aparte**.
2. Genera un hash de una contraseña temporal conocida y sobrescribe esa celda.
3. Prueba en el navegador.
4. **Escribe de vuelta el hash original exacto** y verifica que coincide
   byte-por-byte antes de seguir. Su contraseña real nunca se pierde.

(`backend/scripts/_sheetlib.mjs` tiene `readPromoters()` para leer/escribir esa
columna por su nombre real de fila, sin asumir posiciones.)

### 4. Probar el GPS en tu celular (HTTPS)

Los navegadores móviles **solo dan ubicación en contextos seguros**
(`https://` o `http://localhost`). Para probar en un teléfono real desde tu
compu:

```bash
npm run build
cd backend
SERVE_STATIC=true npm start        # un solo origen, http://localhost:8080
```

En otra terminal, abre un túnel HTTPS:

```bash
cloudflared tunnel --url http://localhost:8080
# o: ngrok http 8080
```

Abre la URL `https://…` que te dé en el celular → inicia sesión → el GPS ya
funciona. Pon `COOKIE_SECURE=true` en `backend/.env` mientras pruebes así (la
cookie de sesión necesita HTTPS para marcarse `Secure`).

### 5. Datos de prueba — nunca dejarlos puestos

Cualquier dato sintético que insertes directamente en `dev.db` para probar
(un `VisitRecord` falso, un reporte de competencia de prueba) es solo para tu
copia LOCAL — no toca el Sheet compartido salvo que tú mismo llames a una
función que escriba ahí. Si necesitas probar un flujo que sí escribe al Sheet
(check-out real, notificaciones, metas), **bórralo después** con Prisma
(`prisma.<modelo>.deleteMany(...)`) y limpia la fila del Sheet correspondiente.

---

## En servidor (Render)

### El panorama: dos servicios, una cuenta de Render

Este proyecto vive en Render bajo la cuenta de Andrea (Andrea Orantes,
`andreaorantes-dot`), con **dos Web Services** desplegados desde su mismo
repositorio de GitHub (`andreaorantes-dot/APP-PROMOTORES`) pero de **ramas
distintas**:

- **Servidor de pruebas** (rama `pruebas`) — donde se prueban cambios antes de
  que los use el equipo real.
- **Servidor final** (rama `main`) — el que usan los promotores de verdad.

Cada uno tiene su **propia base de datos PostgreSQL** (Render las crea por
separado); los datos de un servidor NO se mezclan con los del otro nunca solos.

> Este repositorio local tiene el remoto `destination` apuntando al repo de
> Andrea, y `origin` apuntando al repo personal del desarrollador
> (`josefatvillarreal-creator/promotores`). Para que un cambio llegue a
> CUALQUIERA de los dos servidores de Render, primero tiene que existir en el
> repo de Andrea (`destination`/`upstream`) — un push a `origin` no dispara
> nada ahí.

### Promover código de pruebas → final

1. En el repo de Andrea (GitHub): **Pull Request** de `pruebas` → `main`.
   Revisar el diff, **Merge**.
   - O por línea de comandos, si tienes acceso: `git fetch destination && git checkout main && git merge destination/pruebas && git push destination main`.
2. Render detecta el push a `main` (tiene `autoDeploy: true`, ver `render.yaml`)
   y arranca el deploy del servidor final **solo**, sin tocar nada más.
3. Verificar en el dashboard de Render → servicio final → **Events/Deploys**
   que el deploy terminó bien (revisar logs si `prisma db push` falla).
4. Si el servidor final tiene el auto-deploy desactivado, alguien con acceso
   tiene que entrar y usar **Manual Deploy → Deploy latest commit** después
   del merge.

**Antes de fusionar**, revisar que las variables de entorno del servicio final
tengan todo lo que el servicio de pruebas ya tiene (ver la tabla más abajo) —
Render no las copia solo de un servicio a otro.

### Primer despliegue de un servicio nuevo (Blueprint)

1. `https://render.com` → **New +** → **Blueprint** → conectar el repo →
   Render detecta `render.yaml` y muestra el servicio `promotores` (plan
   Free) → **Apply**.
2. Primer build (unos minutos). Al terminar: `https://<nombre>.onrender.com`.
3. En este primer arranque **no hay datos todavía** (falta configurar Sheets,
   ver abajo).

### Variables de entorno en Render

Las que ya trae `render.yaml` (no hay que tocarlas):

| Variable | Valor |
|---|---|
| `SERVE_STATIC` | `true` — Express sirve el frontend (mismo origen) |
| `COOKIE_SECURE` | `true` — cookie de sesión `Secure` (hay HTTPS) |
| `CHECK_IN_RADIUS_METERS` / `NEARBY_RADIUS_METERS` | `100` / `2000` |
| `SESSION_SECRET` | autogenerado por Render |
| `DATABASE_URL` | conectado automáticamente a la Postgres del blueprint |

Las que hay que agregar a mano en el panel (**Environment**, variables
normales) para que funcione todo lo construido sobre Sheets — **revisa que
ambos servicios (pruebas y final) las tengan**:

| Variable | Valor típico |
|---|---|
| `GOOGLE_SHEETS_ID` | ID del documento "BBDD Promotores" |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | el JSON completo del Service Account, en una línea (como **Secret File** o variable normal marcada sensible) |
| `AUTH_SOURCE` | `sheet` |
| `STORES_SOURCE` | `sheet` |
| `VISITS_SOURCE` | `db` (**nunca** `sheet` en un servidor real — ahí la base de datos SÍ tiene la actividad real) |
| `GOOGLE_SHEETS_PROMOTERS_TAB` / `_TIENDAS_TAB` / `_USUARIOS_TAB` / `_METAS_TAB` / `_NOTIFICACIONES_TAB` / `_COMPETENCIA_TAB` / `_ACTIVIDAD_TAB` | Los nombres reales de las pestañas (ver `backend/.env.example` para los valores por defecto) |
| `PRECIO_ROLLO` / `PRECIO_CUBETA` | Los precios reales del negocio (en 0 el tablero muestra unidades en vez de dinero — no rompe nada, pero conviene ponerlos) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Correo del reporte semanal al admin. Con Google Workspace: `smtp.gmail.com`, `587`, la cuenta, y una **contraseña de aplicación** (no la contraseña normal si hay verificación en 2 pasos). Sin esto configurado, el reporte sigue llegando **in-app**, solo no por correo. |
| `ADMIN_REPORT_EMAIL` | A qué dirección se manda ese correo semanal |

> El Service Account necesita el documento de Sheets compartido como
> **Editor** — si solo puede leer, todo lo que escribe (notificaciones, metas
> desde el botón del admin, filas de Competencia) fallará silenciosamente
> (best-effort: no tumba el check-out, pero tampoco se guarda).

### Alta de usuarios y metas en un servidor ya desplegado

Los scripts de `backend/scripts/` leen `backend/.env` **local** — para que
apunten al Sheet real (que es compartido entre todos los entornos) no hace
falta nada especial, ya que el Sheet es el mismo documento sin importar qué
servidor de Render lo está leyendo. Correr, desde tu máquina, apuntando al
mismo `GOOGLE_SHEETS_ID` que usa el servidor:

```bash
node backend/scripts/create-user.mjs <id> <admin|gerente|supervisor> "<Nombre>"
node backend/scripts/seed-promoter-goals.mjs <meta>
```

### Reporte semanal — sin Cron Job (por ahora)

El reporte semanal de KPIs (`backend/src/weeklyReport.js`) se dispara "de
paso" la próxima vez que alguien abre la campana de notificaciones después de
cumplirse una semana desde el último — **no llega a una hora fija**, decisión
tomada a propósito para no necesitar un servicio de Render nuevo. Si más
adelante se necesita que llegue exactamente, por ejemplo, cada lunes 8am:

1. En Render: **New + → Cron Job**, mismo repo, comando
   `cd backend && node -e "import('./src/weeklyReport.js').then(m=>m.maybeSendWeeklyReports())"`,
   horario `0 8 * * 1`.
2. Quitar (o dejar, es idempotente) la llamada desde `routes/notifications.js`.

### Cosas del plan gratuito de Render a tener presentes

- El servicio **se duerme** tras ~15 min sin uso; la primera visita después
  tarda ~30-60s en "despertar". Para que esté siempre encendido, plan
  **Starter** (de pago).
- La Postgres del plan free **expira a los ~30 días** — para el servidor
  final (producción real), usar un plan de Postgres de pago.
