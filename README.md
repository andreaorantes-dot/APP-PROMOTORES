# App Promotores — Manual de desarrollo

SPA de React (Vite), PWA instalable, + backend Node/Express con Prisma. Tres
roles (**promotor**, **supervisor**, **gerente/admin**), cada uno con su propia
pantalla. **Login con ID + contraseña** (verificada con **bcrypt** en el
servidor); la sesión viaja en una cookie **HttpOnly** con protección CSRF.
Google Sheets es la fuente de datos/configuración del negocio (promotores,
tiendas, usuarios administrativos, metas, notificaciones, competencia); Prisma
(SQLite en local, PostgreSQL en Render) es la base de datos real de la app.

> Para el propósito de negocio de cada función, ver [OBJETIVOS.md](OBJETIVOS.md).
> Para desplegar (local o en Render), ver [MANUAL_DESPLIEGUE.md](MANUAL_DESPLIEGUE.md).

## Arquitectura

```
Promotor / Supervisor / Gerente-Admin
        │  (mismo formulario de login)
        ▼
   AppRouter.jsx  ── decide la pantalla según `user.role` (viene firmado en el JWT)
        │
        ├─ promotor           → PromotoresApp.jsx   (check-in/out, metas, competencia)
        ├─ supervisor         → SupervisorDashboard.jsx (mapa+resumen de SU equipo)
        └─ gerente / admin    → ManagerDashboard.jsx    (mapa+resumen nacional)
```

- **Frontend** (`src/`): React 18 + Vite. Sin router de terceros: `AppRouter.jsx`
  es el único punto de ramificación por rol. PWA instalable (`manifest.webmanifest`,
  `public/sw.js`).
- **Backend** (`backend/`): Node + Express. Cada área de negocio es un archivo
  de rutas bajo `backend/src/routes/` que llama a `backend/src/db.js` (la única
  capa que toca Prisma directamente).
- **Google Sheets**: además de ser el *seed* de promotores/tiendas/usuarios, es
  la fuente de configuración editable a mano (metas de venta, notificaciones) —
  ver la sección de abajo. **Las fotos nunca se guardan en un Sheet** (celdas no
  son buen lugar para binarios): siempre van a la base de datos.

## Roles

| Rol | Pantalla | Ve |
|---|---|---|
| `promotor` | `PromotoresApp.jsx` | Sus tiendas cercanas, check-in/out con foto (rollos/cubetas/galones), su meta de ventas del mes, reporta competencia, su perfil, recuperar su contraseña |
| `supervisor` | `SupervisorDashboard.jsx` | Mapa + resumen **solo de SUS promotores** (los que tienen su nombre en la columna SUPERVISOR de la pestaña Promotores) |
| `gerente` / `admin` | `ManagerDashboard.jsx` | Mapa + resumen **nacional**, puede fijar la meta de cualquier promotor, exporta CSV/Excel |

El rol viaja **firmado dentro del JWT** de sesión (`backend/src/auth.js`); el
cliente no puede falsificarlo. Un supervisor o gerente/admin **no es un
promotor**: vive en la pestaña "Usuarios" del Sheet, no en "Promotores"
(`backend/src/usersSheet.js`), y por eso `GET /api/auth/session` los trata
distinto (no busca una ficha de promotor para ellos).

## Estructura de carpetas

```
APP-PROMOTORES/
├─ src/                        # Frontend (React + Vite)
│  ├─ AppRouter.jsx             # Enrutador por rol (el único "router" que hay)
│  ├─ PromotoresApp.jsx         # App de campo (promotor)
│  ├─ ManagerDashboard.jsx       # Tablero de gerente/admin
│  ├─ SupervisorDashboard.jsx    # Tablero de supervisor
│  ├─ dashboardShared.jsx        # Piezas compartidas entre esos dos tableros
│  │                              # (mapa Leaflet, gráficas SVG, KPI, fila de
│  │                              # promotor, exportación CSV/Excel, EditGoalModal)
│  ├─ NotificationBell.jsx       # Campana de notificaciones (admin/gerente/supervisor)
│  ├─ PromoterProfile.jsx        # Modal de perfil de un promotor: overview + pantalla
│  │                              # de historial (detrás de un menú), agrupado por día,
│  │                              # con reporte de "comportamiento extraño" por visita
│  ├─ CompetenciaPanel.jsx       # Modal de revisión de reportes de Competencia
│  │                              # (admin/gerente ve todos; supervisor, solo su equipo)
│  ├─ OnboardingTour.jsx         # Guía de novedades por rol (ver más abajo)
│  ├─ theme.js                   # Paleta de marca Protexa (compartida por todo)
│  ├─ auth/AuthProvider.jsx      # Sesión (useAuth), llama a /api/auth/session
│  └─ lib/api.js                 # Cliente HTTP (fetch + CSRF + cookies)
├─ backend/
│  ├─ prisma/schema.prisma        # Promoter, Store, VisitRecord, CompetitionReport
│  ├─ src/
│  │  ├─ server.js                # Monta todas las rutas Express
│  │  ├─ auth.js                  # authenticate(), requireAuth, requireRole()
│  │  ├─ db.js                    # ÚNICA capa que llama a Prisma directamente
│  │  ├─ config.js                # Toda la configuración por variable de entorno
│  │  ├─ businessDay.js           # "Día de negocio" en hora de México (no UTC) + rangos
│  │  ├─ promotersSheet.js / usersSheet.js / storesSheet.js
│  │  │                           # Lectura de las pestañas del Sheet (con caché)
│  │  ├─ goalsSheet.js            # Metas: lectura Y escritura (el botón "Meta" del admin)
│  │  ├─ notificationsSheet.js    # Notificaciones: lectura Y escritura
│  │  ├─ competitionSheet.js      # Fila-resumen de un reporte de competencia
│  │  ├─ activitySheet.js         # SOLO desarrollo local: reconstruye el resumen del
│  │  │                           # gerente desde el Sheet cuando VISITS_SOURCE=sheet
│  │  ├─ managerSummary.js        # Agregación PURA (sin BD) del resumen del gerente
│  │  └─ routes/                  # auth, stores, visits, feedback, competition,
│  │                               # manager, supervisor, notifications, promoterProfile
│  └─ scripts/                    # Alta de usuarios, metas, diagnóstico (ver abajo)
├─ render.yaml                    # Blueprint de despliegue en Render
├─ OBJETIVOS.md                   # Para qué existe la app, por rol
└─ MANUAL_DESPLIEGUE.md           # Cómo correrla en local y en Render
```

> Requisito: **Node.js 18+**.

## Puesta en marcha local

```bash
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env        # y complétalo (ver tabla de variables abajo)
npx prisma generate && npx prisma db push   # crea backend/prisma/dev.db (SQLite)
npm run dev                  # http://localhost:8080

# Terminal 2 — frontend
npm install
npm run dev                  # http://localhost:5173
```

Guía completa (incluyendo cómo probar en el celular con HTTPS para el GPS) en
[MANUAL_DESPLIEGUE.md](MANUAL_DESPLIEGUE.md).

### Variables de entorno clave (`backend/.env`)

Ver `backend/.env.example` para la lista completa y comentada. Las más
relevantes para entender el sistema:

| Variable | Qué controla |
|---|---|
| `AUTH_SOURCE` | `db` (Prisma) o `sheet` (login contra la pestaña Promotores/Usuarios del Sheet — lo normal en producción) |
| `STORES_SOURCE` | `db` o `sheet` (sincroniza el catálogo de tiendas desde la pestaña Tiendas) |
| `VISITS_SOURCE` | `db` (fuente real) o `sheet` — **solo para desarrollo local**: reconstruye el resumen del gerente desde la pestaña "Actividad Diaria" del Sheet, porque la base local no tiene actividad real (esa vive en el Postgres de producción) |
| `GOOGLE_SHEETS_ID` + credenciales del Service Account | Documento de Google Sheets que actúa como fuente de datos |
| `PRECIO_ROLLO` / `PRECIO_CUBETA` | Para calcular "dinero vendido" en los tableros; en 0 no rompe nada, solo se ven cantidades en vez de montos |
| `CHECK_IN_RADIUS_METERS` / `NEARBY_RADIUS_METERS` | Reglas de geolocalización del check-in |

## Google Sheets: fuente de datos y configuración

Todo vive en **un solo documento** ("BBDD Promotores"), con estas pestañas:

| Pestaña | Para qué | Quién la lee/escribe |
|---|---|---|
| **Promotores** | ID, nombre, ubicación, supervisor, contraseña (hash) de cada promotor | Login de promotores (`promotersSheet.js`); todos los tableros leen aquí el nombre de supervisor de cada promotor |
| **Tiendas** | Catálogo global de tiendas (num, nombre, lat, lng, **estado**) | `storesSheet.js`, sincroniza a la BD local con `STORES_SOURCE=sheet` |
| **Usuarios** | ID, nombre, rol (`admin`\|`gerente`\|`supervisor`), contraseña (hash) | Login de administración (`usersSheet.js`) — **nunca** promotores de campo |
| **Metas** | Tipo (`promotor`\|`tienda`), ID, nombre, meta mensual en **unidades** (rollos+cubetas+galones) | `goalsSheet.js` — el botón "Meta" del tablero de admin **escribe** aquí |
| **Notificaciones** | Registro de check-in, meta de promotor/tienda alcanzada, solicitud de recuperación de contraseña, reporte semanal | `notificationsSheet.js` — se escribe sola desde el backend, nadie la edita a mano |
| **Competencia** | Fila-resumen (fecha, promotor, marca, descripción, nº de fotos) de cada reporte | `competitionSheet.js` **escribe** aquí; el panel de revisión (`CompetenciaPanel.jsx`) **lee** de la base de datos, no de esta pestaña — las fotos NO están aquí, viven en `CompetitionReport` |
| **Actividad Diaria** | Auditoría de cada check-out: entrada, salida, rollos, cubetas, **galones** (la escribe `sheets.js`) | Solo lectura en desarrollo local (`VISITS_SOURCE=sheet`); en producción el resumen del gerente usa la base de datos real, no esta pestaña |
| **Retroalimentacion** | Reportes de "algo no funciona" desde la app del promotor **y** reportes de "comportamiento extraño" que admin/gerente/supervisor levantan desde el historial de un promotor (mismo formato, distinto `enviado_por`) | `sheets.js` (`appendFeedbackRow`) |

Cómo se autentica el backend: un **Service Account** de Google Cloud, con el
documento compartido con su `client_email` como editor. Ver
[MANUAL_DESPLIEGUE.md](MANUAL_DESPLIEGUE.md) para los pasos exactos.

## Base de datos (Prisma)

Modelos en `backend/prisma/schema.prisma`: `Promoter`, `Store`, `VisitRecord`
(rollos, cubetas, **galones**, con la foto del check-in en Base64),
`CompetitionReport` (con sus fotos en Base64, JSON-array). Motor:

- **Local:** SQLite (`backend/prisma/dev.db`).
- **Render:** PostgreSQL (gestionado por Render, ver `render.yaml`).

> ⚠️ **`schema.prisma` tiene `git update-index --skip-worktree` activado.** La
> copia local dice `provider = "sqlite"`; la versión que está en git (y que
> Render despliega) dice `provider = "postgresql"`. Git **no** te va a avisar
> si cambias el modelo y se te olvida reflejarlo en la versión de git. Antes de
> cualquier commit que toque `schema.prisma`:
> ```bash
> git update-index --no-skip-worktree backend/prisma/schema.prisma
> #  edita el archivo para que diga  provider = "postgresql"
> git add backend/prisma/schema.prisma
> #  edita el archivo OTRA VEZ para que vuelva a decir  provider = "sqlite"
> git update-index --skip-worktree backend/prisma/schema.prisma
> ```
> (el resto del contenido — los modelos — debe ser idéntico en ambas versiones;
> solo el `provider` cambia).

```bash
cd backend
npx prisma generate     # regenera el cliente después de tocar el schema
npx prisma db push      # aplica el esquema a la base (local o remota)
npx prisma studio        # explorar los datos
```

## Metas de venta

Mensuales, en **unidades** (rollos + cubetas + galones), no en dinero
(decisión de producto). Sin fila en "Metas" = sin meta asignada (no se exige
nada, no se generan notificaciones).

- **Ver:** todos los tableros calculan el avance del mes desde la base de
  datos real (`db.js` → `attachGoalProgress` / `getMyGoalProgress`).
- **Fijar:** solo admin/gerente, con el botón **"Meta"** en cada fila del
  tablero (`PUT /api/manager/promoter/:id/goal`) — el supervisor y el promotor
  solo la ven.
- **Scripts:** `node backend/scripts/set-goal.mjs promotor <ID> <META> "<Nombre>"`
  (uno a la vez) o `node backend/scripts/seed-promoter-goals.mjs [META]` (siembra
  un valor placeholder para todos los que aún no tengan meta — **no pisa** las
  que ya existen).

## Notificaciones

Centro **dentro de la app** (campana, se actualiza sola cada 30s) — no hay push
real al sistema operativo. Cinco tipos, guardados en la pestaña "Notificaciones":

1. **`checkin`** — un promotor hizo check-in → aviso a **su supervisor** (con
   tienda y nombre).
2. **`promoter_goal`** — un promotor alcanzó su meta del mes → aviso a **su
   supervisor** (una sola vez por mes, idempotente).
3. **`store_goal`** — una tienda alcanzó su meta del mes → aviso a **admin**.
4. **`password_recovery`** — alguien pidió recuperar su cuenta desde el login
   → aviso a su supervisor (o a "admin" si es un promotor sin supervisor, o
   si quien la pidió es admin/gerente/supervisor). No resetea nada por sí
   sola (ver la sección de arriba).
5. **`weekly_report`** — resumen semanal de KPIs, uno para admin y uno por
   cada supervisor (con su equipo). Reutiliza `getManagerSummary("week")`, sin
   agregación nueva. **Sin cron/worker**: se dispara "de paso" la próxima vez
   que alguien abre la campana después de cumplirse una semana desde el
   último (idempotente vía la fecha de la última notificación de este tipo;
   un cooldown en memoria de 30 min evita repetir la consulta al Sheet en
   cada poll de 30s) — por diseño **no llega a una hora fija**. Al admin
   además se le intenta mandar por **correo** (`backend/src/mailer.js`, SMTP
   genérico) — sin `SMTP_HOST/USER/PASS` configurados, se omite sin romper
   nada (igual que Google Sheets si no está configurado).

Admin/gerente además ven un **insight en vivo** (Top 5 vendedores del día), que
**no se guarda**: se recalcula cada vez que se abre la campana.

## Tablero del gerente / supervisor (mapa + KPIs + panel)

- **Rango de fechas** (`RANGE_OPTIONS` en `dashboardShared.jsx`, resuelto por
  `businessDay.js#resolveRange`): hoy, ayer, esta semana, la semana pasada,
  este mes, el mes pasado, este año, el año pasado — todos en hora de México.
- **Filtro de estado**: lista siempre los **32 estados de México**
  (`MEXICO_ESTADOS` en `dashboardShared.jsx`), no solo los que tengan
  actividad en el rango — depende de que la pestaña "Tiendas" tenga la
  columna ESTADO capturada; si no, todo cae en "Sin estado".
- **KPIs interactivos**: cada tarjeta (`Kpi`) tiene un `tooltip` (hover) que
  explica qué mide, y un `onClick` que aplica el mismo filtro de segmento
  (`todos`\|`con`\|`sin`\|`in`\|`meta`) que usan los botones de abajo — como
  el mapa y el listado ya reaccionan a ese filtro, hacer clic en "Sin ventas"
  resalta en el mapa justo a esos promotores.
- **Panel colapsado (escritorio)**: al colapsar, el panel se desliza dejando
  solo una franja de 46px visible. `PanelHeader` tiene una variante compacta
  para ese estado (ancho fijo de 46px, botón con flecha izquierda) — la
  cabecera normal NO cabe ahí (sus botones quedan fuera de la franja), así
  que si se toca el layout del panel colapsado hay que respetar ese ancho.

## Competencia

El promotor reporta marca/competidor + descripción + hasta 5 fotos desde la
pantalla "Competencia". El reporte completo (con fotos) se guarda en
`CompetitionReport`; el Sheet solo recibe la fila-resumen. Ver
`backend/src/routes/competition.js`.

**Panel de revisión** (`CompetenciaPanel.jsx`, botón de bandera 🚩 en el
header del tablero): lista los reportes (más recientes primero) con las
fotos como miniaturas (clic para verlas en grande). Admin/gerente ven todos
(`GET /api/manager/competencia`); supervisor solo los de su equipo
(`GET /api/supervisor/competencia`, filtrado por `db.js#getCompetitionReports`).
Es de solo lectura: no hay un estado de "revisado" (ver pendientes en
[OBJETIVOS.md](OBJETIVOS.md)).

## Onboarding

Guía de 3-5 tarjetas, **distinta por rol**, que aparece la primera vez que cada
rol entra después de un cambio (`src/OnboardingTour.jsx`). Se controla con
`localStorage` (`onboarding_seen_v1_<rol>`) — **sin backend**. Para que todos la
vuelvan a ver tras agregar una feature nueva, sube la versión (`v1` → `v2`) en
la constante de cada pantalla. Cada pantalla tiene un botón de ayuda ("?") para
reabrirla manualmente en cualquier momento.

## Perfil de promotor (historial + reporte de comportamiento)

Modal (`PromoterProfile.jsx`) con dos pantallas:

1. **Overview** (por defecto): nombre, supervisor, tiendas más frecuentes, y
   un botón-menú "Historial de check-in / check-out →" con el total de
   visitas.
2. **Historial** (se abre al hacer clic en ese menú, con flecha ← para
   volver): las visitas **agrupadas por día**. Cada visita tiene un ícono de
   alerta ⚠️ que abre un mini-formulario inline para reportar un
   **comportamiento extraño** puntual (ej. checkout casi inmediato al
   check-in, cero ventas en una tienda donde normalmente sí vende).

Ese reporte se guarda con el **mismo formato y en la misma pestaña** que la
retroalimentación de los promotores (`POST /api/promoters/:id/report-behavior`
→ `appendFeedbackRow`), solo que `enviado_por` es la sesión de quien lo
levanta (admin/gerente/supervisor), no la del promotor. Un promotor no puede
usar esta vía para reportarse a sí mismo.

Lo abre admin/gerente (cualquier promotor), un supervisor (**solo los
suyos**, y solo puede reportar comportamiento de los suyos) o **el propio
promotor** (solo su perfil, solo para ver — no ve el ícono de reporte, en la
pestaña "Perfil" de su app, "Mi historial"). Todo validado en el servidor por
rol (`GET /api/promoters/:id/profile`, `POST .../report-behavior`). El
historial lee siempre la base de datos local, nunca el Sheet — en desarrollo
local puede aparecer vacío si ese promotor nunca hizo check-in/out en este
backend.

## Recuperación de contraseña (sin resetearla sola)

En el login: ícono de ojo 👁 para mostrar/ocultar la contraseña, y un link
discreto "recuperar mi cuenta" debajo del botón de iniciar sesión. Abre una
pantalla que solo pide el ID — al enviarlo (`POST /api/auth/recover-request`,
**pública**, sin sesión) el backend **no resetea nada**, solo **avisa**: si
el ID es de un promotor, notifica a su supervisor (o a "admin" si no tiene
uno asignado); si es de un admin/gerente/supervisor (pestaña "Usuarios"),
notifica a "admin". La respuesta al cliente es **idéntica exista o no el ID**
(mismo criterio anti-enumeración que `authenticate()` en `auth.js`). El
reseteo real sigue siendo manual (`backend/scripts/reset-password.mjs`) — no
hay reseteo self-service todavía.

## Recordatorio de check-out

Si el promotor tiene un check-in abierto (sin check-out) y ya es tarde (≥19:00
hora local del dispositivo), el dashboard le muestra un aviso para que
registre su salida — solo cliente, sin backend nuevo (`PromotoresApp.jsx`).

## Contrato de backend

Rutas bajo `VITE_API_BASE` (por defecto `/api`, mismo origen).

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/login` | público | `{ promoterId, password }`. bcrypt + cookie de sesión HttpOnly. |
| POST | `/auth/recover-request` | público | `{ promoterId }`. No resetea nada: avisa al supervisor (o admin) que hace falta una contraseña nueva. Misma respuesta exista o no el ID. |
| GET | `/auth/session` | cualquiera con sesión | `{ id, name, role, ...(location/supervisor si es promotor) }` |
| POST | `/auth/logout` | cualquiera con sesión | Invalida la sesión |
| GET | `/stores?lat=&lng=` | promotor | Tiendas dentro de ~2 km (Haversine) |
| GET | `/stores/all` | promotor | Catálogo completo (para el mapa de Inicio) |
| POST | `/visits/:storeId/check-in` | promotor | `{ coords, photo }`. Foto obligatoria. |
| POST | `/visits/:storeId/check-out` | promotor | `{ coords, rollos, cubetas, galones }`. Escribe la fila en Actividad Diaria + revisa metas. |
| GET | `/visits/today` | promotor | Visitas de hoy del promotor logueado |
| GET | `/visits/my-goal` | promotor | Su meta mensual y avance, o `null` |
| POST | `/feedback` | promotor | Reporte de "algo no funciona" |
| POST | `/competition` | promotor | `{ marca, descripcion, fotos? }` (hasta 5) |
| GET | `/manager/summary?range=` | gerente/admin | `today\|yesterday\|week\|last_week\|month\|last_month\|year\|last_year`. Resumen nacional. |
| PUT | `/manager/promoter/:id/goal` | gerente/admin | `{ meta, nombre? }`. Fija la meta mensual. |
| GET | `/manager/competencia` | gerente/admin | Reportes de Competencia (todos), más recientes primero. |
| GET | `/supervisor/summary?range=` | supervisor | Mismo resumen, acotado a sus promotores |
| GET | `/supervisor/competencia` | supervisor | Mismos reportes de Competencia, acotados a su equipo |
| GET | `/notifications` | admin/gerente/supervisor | Las suyas + insight Top 5 (solo admin/gerente) |
| GET | `/promoters/:id/profile` | cualquiera | Historial (promotor: solo el suyo; supervisor: solo los suyos) |
| POST | `/promoters/:id/report-behavior` | admin/gerente/supervisor | `{ day, storeName, descripcion }`. Reporta comportamiento extraño sobre una visita; se guarda como retroalimentación. |
| GET | `/sheets/status` | cualquiera con sesión | Diagnóstico de la conexión a Google Sheets |
| GET | `/health` | público | Health check de Render |

## Scripts de administración (`backend/scripts/`)

| Script | Para qué |
|---|---|
| `create-user.mjs <ID> <admin\|gerente\|supervisor> "<Nombre>" [--password]` | Alta/edición en la pestaña Usuarios. El ID de un supervisor debe ser su nombre en minúsculas (así se filtran sus promotores). |
| `set-goal.mjs <promotor\|tienda> <ID> <META> ["<Nombre>"]` | Alta/edición de UNA meta en la pestaña Metas. |
| `seed-promoter-goals.mjs [META]` | Siembra una meta placeholder para todos los promotores que aún no tengan una (no pisa las existentes). |
| `reset-password.mjs <ID_PROMOTOR>` | Genera y guarda una contraseña nueva para un promotor. |
| `inspect-sheet.mjs` | Imprime la estructura real (pestañas, encabezados, muestras) del Sheet — úsalo antes de asumir cómo está organizado. |
| `migrate-passwords.mjs` | Utilidad histórica de migración de contraseñas. |

## Autenticación (ID + contraseña, bcrypt)

- **Login:** `POST /api/login { promoterId, password }`. Busca primero en
  "Usuarios" (admin/gerente/supervisor) y si no está ahí, en "Promotores"
  (`backend/src/auth.js`). Compara con **bcrypt**; respuesta genérica **401**
  si falla (no revela si el ID existe; comparación dummy para mitigar timing).
- **Sesión:** JWT en cookie **HttpOnly; Secure; SameSite=Strict** (+ token
  CSRF), con el `role` firmado adentro. No se usa `localStorage` para nada de
  sesión.
- **Contraseñas:** nunca en texto plano; solo el hash bcrypt vive en el Sheet o
  en la base de datos.

## Protección CSRF

Patrón **double-submit cookie ligado a la sesión** (`backend/src/csrf.js`):

1. Al iniciar sesión, el backend genera un token CSRF y lo pone en dos lugares:
   como claim `csrf` firmado dentro del JWT (cookie HttpOnly) y en una cookie
   `csrf_token` **legible por JS**.
2. El SPA reenvía `csrf_token` en el header `X-CSRF-Token` en toda petición que
   cambia estado (`src/lib/api.js`).
3. El backend compara (timing-safe) el header contra el claim del JWT; si no
   coinciden, `403`.

## Geolocalización del check-in (servidor autoritativo)

El frontend solo envía sus coordenadas GPS reales. El **servidor** recalcula la
distancia con **Haversine** (`backend/src/geo.js`) y rechaza el check-in/out
con **403** si el promotor está a más de `CHECK_IN_RADIUS_METERS` (100 m por
defecto), o **400** si faltan coordenadas válidas. El radar del cliente es solo
informativo.

## Almacenamiento offline seguro (cifrado en reposo)

Sin red, las acciones de visita (check-in/out, con inventario y foto) se
guardan localmente **cifradas** (AES-GCM 256, `src/lib/crypto.js`) y se
sincronizan solas al reconectar (`src/lib/offlineStore.js`, IndexedDB vía
localforage). Nada queda en texto plano en el dispositivo.

> Modelo de amenaza (honesto): protege los datos **en reposo** (inspección del
> IndexedDB, backups del teléfono). NO protege contra malware que ejecute JS
> dentro de la página con la sesión abierta.

## "Día de negocio" en hora de México (no UTC)

`backend/src/businessDay.js` calcula el día/rango con `Intl.DateTimeFormat` en
`America/Mexico_City`, no con `new Date().toISOString()`. Con UTC, cualquier
check-in/check-out después de ~18:00 hora local caía en la fecha del día
siguiente y corría esa actividad al resumen equivocado — ya corregido; **todo**
lo que calcule un "día" (check-in, check-out, resumen del gerente, metas) debe
pasar por aquí, no reinventar el cálculo.
