# App Promotores — registro de visitas seguro

SPA de React (Vite) + backend Node/Express. **Login con ID de promotor +
contraseña** (verificada con **bcrypt** en el servidor); la sesión viaja en una
cookie **HttpOnly** con protección CSRF. Datos en **SQLite vía Prisma**.

## Estructura

```
APP PROMOTORES/
├─ src/               # Frontend (React + Vite)
├─ backend/           # Backend (Node.js + Express, Prisma, bcrypt)
├─ Promotores.csv     # BBDD de promotores (contraseñas en claro) — NO versionar
├─ .env / .env.example
```

> Requisito: **Node.js 18+**.

## Puesta en marcha

```bash
# Terminal 1 — backend
cd backend
npm install
npm run db:migrate   # crea la BD SQLite, aplica migraciones y siembra desde el CSV
npm run dev          # http://localhost:8080

# Terminal 2 — frontend
npm install
npm run dev          # http://localhost:5173
```

Abre http://localhost:5173 e inicia sesión con un **ID de promotor** y su
**contraseña** (de `Promotores.csv`).

> **Nota sobre el GPS:** el check-in exige GPS real (radio de 100 m, validado en
> el servidor). En un desktop sin GPS, tu ubicación (por IP) estará lejos de las
> tiendas y el check-in será rechazado con 403. Para probar en desktop, usa
> **Chrome DevTools → Sensors → Location** con coordenadas cerca de una tienda.

## Móvil / instalar como app (PWA)

La UI es **responsive** (ocupa toda la pantalla, `100dvh`) y la app es una
**PWA instalable**: `manifest.webmanifest`, iconos, `theme-color` y un service
worker (`public/sw.js`) que cachea el shell. El SW se registra **solo en el
build de producción** (en dev interferiría con el hot-reload de Vite).

Probar la versión instalable:

```bash
npm run build
npm run preview -- --host   # expone en la red local (WiFi)
```

En el **celular**, con la misma WiFi, abre `http://<IP-de-tu-PC>:4173` y usa el
menú del navegador → **"Agregar a pantalla de inicio" / "Instalar app"**. Se
abre en pantalla completa, sin barra del navegador, como una app nativa.

Los iconos se generan con `node scripts/gen-icons.mjs` (encoder PNG sin
dependencias) hacia `public/`.

> Para GPS real en el celular, el navegador pedirá permiso de ubicación; sirve
> por `http://localhost` o por **HTTPS** (algunos navegadores exigen HTTPS para
> geolocalización fuera de localhost).

## Autenticación (ID + contraseña, bcrypt)

- **Login:** `POST /api/login { promoterId, password }`. El backend busca al
  promotor y compara la contraseña con su **hash bcrypt** (`backend/src/auth.js`).
  Si es correcto, emite un JWT de sesión en cookie **HttpOnly; Secure;
  SameSite=Strict** (+ token CSRF). Respuesta genérica **401** si falla (no
  revela si el ID existe; comparación dummy para mitigar timing).
- **Contraseñas hasheadas en reposo:** el seed lee `Promotores.csv`, hashea cada
  contraseña con bcrypt y guarda **solo el hash** en SQLite. La contraseña en
  claro nunca se persiste ni se registra en logs.
- **Sesión:** el JWT vive en cookie HttpOnly (invisible a JS, protege de XSS);
  no se usa `localStorage`. CSRF por double-submit ligado a la sesión.

## Base de datos (Prisma)

Modelos `Promoter` (id, name, location, supervisor, **password** hasheada),
`Store`, `VisitRecord` en `backend/prisma/schema.prisma`. Motor **SQLite**
(`backend/prisma/dev.db`). La foto de la visita se persiste (Base64) en
`VisitRecord.photo`.

```bash
cd backend
npm run db:migrate   # crear/aplicar migraciones + seed (desde Promotores.csv)
npm run db:seed      # solo re-sembrar desde el CSV
npm run db:studio    # explorar los datos (Prisma Studio)
```

El seed lee **dos CSV de la raíz del proyecto** (o de `SEED_CSV_PATH` /
`SEED_STORES_CSV_PATH`):

- `Promotores.csv` — **UTF-8, separado por comas**. Columnas:
  `id, nombre, ubicacion, supervisor, contraseña`. Crea **una cuenta por
  promotor** (contraseña hasheada con bcrypt). Actualmente: **54 promotores**.
- `Tiendas.csv` — **Latin-1/CP1252, separado por `;`** (el seed lo decodifica
  con la codificación correcta, así los acentos como "Revolución" se guardan
  bien). Columnas: `num, nombre, lat, lng`. Catálogo **global** de tiendas.
  Actualmente: **143 tiendas**.

Regenerar la BD desde cero (dev): borra `backend/prisma/dev.db`, luego
`npx prisma migrate deploy && npm run db:seed`.

**Producción con PostgreSQL:** cambia `provider = "postgresql"` en
`prisma/schema.prisma`, pon el `DATABASE_URL` de Postgres en `.env` y corre
`npm run db:migrate`. El código de queries (`src/db.js`) no cambia.

## Tiendas por cercanía (sin asignación fija)

No hay relación tienda↔promotor: el catálogo de tiendas es **global**. El
frontend envía su ubicación GPS real a **`GET /api/stores?lat&lng`** y el
**servidor** devuelve solo las tiendas dentro de `NEARBY_RADIUS_METERS` (2 km
por defecto), calculando la distancia con **Haversine** y ordenando por cercanía.
El dashboard muestra automáticamente esas tiendas (con su distancia).

## Geolocalización del check-in (servidor autoritativo)

El frontend **solo envía sus coordenadas GPS reales** (sin modo simulación). El
**servidor** recalcula la distancia con **Haversine** (`backend/src/geo.js`) y
rechaza el check-in/out con **403** si el promotor está a más de
`CHECK_IN_RADIUS_METERS` (100 m por defecto), o **400** si faltan coordenadas
válidas. El radar del cliente es solo informativo.

## Google Sheets (registro para el administrador)

Al completar un **check-out**, el backend agrega una fila al Google Sheet del
administrador con: registrado_en, ID promotor, nombre, tienda, hora entrada,
hora salida, rollos, cubetas (`backend/src/sheets.js`). Es **best-effort**: si
Sheets falla o no está configurado, el check-out igual responde 200.

Configuración (Service Account):

1. En Google Cloud, crea un **Service Account** y descarga su clave **JSON**.
2. Habilita la **Google Sheets API** en el proyecto.
3. Comparte el documento de Sheets con el `client_email` del Service Account
   (permiso de **editor**).
4. En `backend/.env`:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
   GOOGLE_SHEETS_ID=<id del documento>
   GOOGLE_SHEETS_TAB=Visitas
   ```

El JSON de credenciales y `Promotores.csv` están en `.gitignore`: **nunca** se versionan.

## Contrato de backend

Rutas bajo `VITE_API_BASE` (por defecto `/api`, mismo origen).

| Método | Ruta                          | Descripción |
|--------|-------------------------------|-------------|
| POST   | `/login`                      | Body `{ promoterId, password }`. Verifica con bcrypt y emite la cookie de sesión HttpOnly. `401` si falla. |
| GET    | `/auth/session`               | Devuelve `{ id, name, location, supervisor }` o `401`. |
| POST   | `/auth/logout`                | Invalida la sesión y limpia la cookie. |
| GET    | `/stores?lat=&lng=`           | Tiendas dentro de ~2 km (Haversine). `{ radius, stores: [{...store, distance}] }`. `400` si faltan coords. |
| POST   | `/visits/:storeId/check-in`   | Body `{ coords, photo }`. Valida distancia (Haversine) y foto obligatoria. |
| POST   | `/visits/:storeId/check-out`  | Body `{ coords, rollos, cubetas }`. Agrega la fila al Google Sheet. |
| GET    | `/visits/today`               | `{ records: { [storeId]: registro } }` del día para el promotor. |

### Recomendaciones de endurecimiento del backend

- Cookie de sesión: `HttpOnly; Secure; SameSite=Strict; Path=/`, con expiración
  corta y rotación. **Implementado** en `backend/src/auth.js`.
- Protección **CSRF** explícita (double-submit ligado a la sesión):
  **implementado** en `backend/src/csrf.js`. Ver sección "CSRF" abajo.
- Cabeceras de seguridad (`X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer`, `X-Frame-Options: DENY`): **implementado** en `server.js`.
  Pendiente en despliegue: `Content-Security-Policy` estricta.
- No registrar nunca contraseñas, tokens ni coordenadas en logs.
- Contraseñas hasheadas con **bcrypt**; verificación en el servidor con respuesta
  genérica. **Implementado** en `backend/src/auth.js` + seed.

## Protección CSRF

Patrón **double-submit cookie ligado a la sesión** (`backend/src/csrf.js`):

1. Al iniciar sesión, el backend genera un token CSRF aleatorio y lo pone en dos
   lugares: como claim `csrf` firmado dentro del JWT de sesión (cookie HttpOnly,
   infalsificable) y en una cookie `csrf_token` **legible por JS**.
2. El SPA lee `csrf_token` y la reenvía en el header `X-CSRF-Token` en toda
   petición `POST/PUT/PATCH/DELETE` (`src/lib/api.js`).
3. El backend compara (timing-safe) el header contra el claim del JWT. Si no
   coinciden → `403`.

Un sitio atacante en otro origen no puede leer la cookie `csrf_token` (Same-Origin
Policy) ni forjar el claim dentro del JWT firmado, así que no puede construir la
petición. `SameSite=Strict` actúa como segunda capa de defensa.

## Almacenamiento offline seguro (cifrado en reposo)

Cuando el promotor no tiene red, las acciones de visita (check-in/out, con
inventario y foto) se guardan localmente **cifradas** y se sincronizan solas al
reconectar. Nada queda en texto plano en el dispositivo.

**Foto obligatoria en el check-in:** el check-in exige una foto de la visita
(`<input type="file" accept="image/*" capture="environment">`, abre la cámara
trasera en móvil). La imagen se redimensiona en el cliente (`resizeImage`, canvas
→ JPEG) y **pasa por la bóveda AES-GCM** antes de escribirse en IndexedDB si se
capturó sin red; con red viaja al backend, que la exige y valida (`assertValidPhoto`)
y nunca la devuelve cruda (solo `hasPhoto`). Verificado: el blob cifrado de una
visita con foto no contiene el Base64 en claro (`data:image`, `/9j/` ausentes) y
descifra correctamente con la clave de la bóveda.

- `src/lib/crypto.js` — **AES-GCM 256** (Web Crypto). La clave se genera con
  `extractable: false` y se persiste como `CryptoKey` en IndexedDB: su material
  crudo nunca es accesible desde JS (ni un XSS puede volcarla). IV aleatorio de
  96 bits por operación.
- `src/lib/offlineStore.js` — cola (`outbox`) y caché de registros del día, sobre
  **localforage/IndexedDB**. Todo se cifra con `encryptJSON` antes de escribir;
  en disco solo hay `{ iv, ct }`.
- `src/PromotoresApp.jsx` — detecta `online/offline`, muestra un banner de estado,
  encola de forma optimista cuando no hay red y hace *flush* al recuperar la
  conexión. Al sincronizar, el backend revalida CSRF + identidad + distancia.

Verificado en navegador: con la red caída, el `outbox` de IndexedDB contenía solo
ciphertext (0 fugas de texto plano) y la clave figuraba como `extractable:false`;
al reconectar, la cola se vació y la visita quedó registrada en el backend.

> Modelo de amenaza (honesto): protege los datos **en reposo** (inspección del
> IndexedDB, backups del teléfono, otra app leyendo el store). NO protege contra
> malware que ejecute JS dentro de la página con la sesión abierta — ningún
> esquema de cliente puede, pues necesitaría descifrar en vivo.

## Alternativa: modo "solo en memoria" (sin backend de sesión)

Si por ahora no hay backend que emita la cookie, `src/lib/tokenStore.js` permite
guardar un token de acceso de vida corta **solo en memoria** (nunca en
`localStorage`). Es menos seguro que la cookie `HttpOnly` (un XSS podría leer la
memoria en tiempo de ejecución) y se pierde al recargar. Úsalo solo como puente
temporal; el objetivo es el flujo con cookie descrito arriba.
