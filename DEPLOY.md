# Despliegue — HTTPS para que el GPS funcione en los teléfonos

Los navegadores móviles **solo dan la ubicación GPS en contextos seguros**:
`https://` o `http://localhost`. Por WiFi con `http://<IP>` la geolocalización
queda bloqueada. Por eso, para usarla en los celulares de los promotores,
**necesitas HTTPS**. Aquí hay tres caminos, de más rápido a más definitivo.

El check-in dentro de 100 m usa `enableHighAccuracy: true` (GPS del hardware) y
el **servidor** valida la distancia con Haversine. Con HTTPS + GPS del teléfono,
la precisión típica al aire libre (±5–30 m) entra sin problema en el radio.

---

## Opción A — Túnel HTTPS (para probar HOY, sin dominio ni certificados)

Da una URL `https://…` pública que abre cualquier teléfono, en cualquier red.

1. Arranca la app en tu PC (un solo origen, sirviendo API + frontend):
   ```bash
   npm run build
   cd backend
   SERVE_STATIC=true npm start        # http://localhost:8080
   ```
2. En otra terminal, levanta un túnel a ese puerto. Con **cloudflared**:
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
   (o `ngrok http 8080`). Te dará una URL tipo `https://algo.trycloudflare.com`.
3. Abre esa URL en el **celular** → inicia sesión → el GPS ya funciona. Desde el
   menú del navegador, **"Instalar app / Agregar a pantalla de inicio"**.

> Nota: pon `COOKIE_SECURE=true` en `backend/.env` cuando sirvas por HTTPS, para
> que la cookie de sesión se marque `Secure`.

---

## Opción B — Docker + Caddy (HTTPS automático, despliegue permanente)

Requiere un servidor con un **dominio** (DNS apuntando a su IP) y los puertos
80/443 abiertos. Caddy obtiene y renueva el certificado TLS solo.

1. Edita `Caddyfile` y `docker-compose.yml`: reemplaza
   `promotores.tudominio.com` por tu dominio.
2. Crea un `.env` en la raíz con un secreto fuerte:
   ```
   SESSION_SECRET=<48+ bytes aleatorios>
   ```
3. Arranca:
   ```bash
   docker compose up -d --build
   ```
4. **Siembra los datos** (una vez), con los CSV montados o copiados al contenedor:
   ```bash
   docker compose exec app npm run db:seed
   ```
   (o coloca `Promotores.csv` y `Tiendas.csv` accesibles y define
   `SEED_CSV_PATH` / `SEED_STORES_CSV_PATH`).

La app queda en `https://tudominio` — instalable como PWA en los teléfonos.

---

## Opción C — Escala real: PostgreSQL

SQLite (con **WAL** + `busy_timeout`, ya activados) aguanta bien las decenas de
check-in simultáneos de este equipo de promotores. Si creces a cientos/miles de
escrituras concurrentes, cambia a PostgreSQL:

1. `backend/prisma/schema.prisma`: `provider = "postgresql"`.
2. `DATABASE_URL="postgresql://user:pass@host:5432/promotores?schema=public"`.
3. `npm run db:migrate && npm run db:seed`.

El código de queries (`src/db.js`) no cambia.

---

## Robustez ante muchos check-in simultáneos (ya implementado)

- **SQLite en modo WAL** + `busy_timeout=8000` (`backend/src/prisma.js`):
  lectores concurrentes y escrituras que esperan en vez de fallar.
- **Reintentos** en las escrituras ante bloqueos transitorios (`withWriteRetry`).
- **El servidor no se cae** por un error puntual de una petición: manejadores
  globales de `unhandledRejection`/`uncaughtException` + middleware de error de
  Express (`backend/src/server.js`).
- **Frontend**: botón de check-in con guardia anti-doble-envío (`busy`), y la
  foto se comprime en el cliente (~100–200 KB) para no saturar la red.
- Cada acción es **bajo demanda** (no hay polling), así que N usuarios = N
  peticiones puntuales, no carga sostenida.
