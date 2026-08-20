import "dotenv/config";

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.warn(`[config] Falta la variable de entorno ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  // Origen de autenticación de promotores: "db" (Prisma, por defecto) o "sheet"
  // (lee el promotor + su hash bcrypt directamente del Google Sheet).
  authSource: (process.env.AUTH_SOURCE ?? "db").toLowerCase(),

  // Origen del catálogo de tiendas: "db" (Prisma) o "sheet" (sincroniza la
  // pestaña Tiendas del Sheet hacia la base local).
  storesSource: (process.env.STORES_SOURCE ?? "db").toLowerCase(),

  session: {
    secret: required("SESSION_SECRET", "insecure-dev-secret"),
    ttlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 28800),
    cookieSecure: String(process.env.COOKIE_SECURE ?? "false") === "true",
    cookieName: "session",
  },

  // Radio máximo (m) permitido entre promotor y tienda para check-in/out.
  // FUENTE DE VERDAD: el servidor recalcula la distancia (Haversine) y rechaza
  // si se supera. Requisito Protexa: 100 m con GPS real.
  rangeMeters: Number(process.env.CHECK_IN_RADIUS_METERS ?? 100),

  // Radio (m) para listar tiendas cercanas en GET /api/stores?lat&lng.
  nearbyRadiusMeters: Number(process.env.NEARBY_RADIUS_METERS ?? 2000),

  // --- Google Sheets (solo para el administrador) --------------------------
  // Al hacer check-out, el backend agrega una fila con los datos de la visita.
  // Se autentica con un Service Account. Puedes darle las credenciales de dos
  // formas (cualquiera): el JSON completo en `GOOGLE_SERVICE_ACCOUNT_JSON`, o la
  // ruta a un archivo JSON en `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`. Si no hay
  // credenciales o spreadsheetId, la integración se omite (no bloquea nada).
  sheets: {
    json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "", // JSON completo (env var)
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "", // o ruta a un archivo JSON
    spreadsheetId: process.env.GOOGLE_SHEETS_ID ?? "",
    tab: process.env.GOOGLE_SHEETS_TAB ?? "Visitas",
    // Pestaña donde se guarda la retroalimentación (reportes de error) que
    // envían los asesores desde la app. Se crea sola si no existe.
    feedbackTab: process.env.GOOGLE_SHEETS_FEEDBACK_TAB ?? "Retroalimentacion",
    // Pestaña de promotores (usada cuando AUTH_SOURCE=sheet).
    promotersTab: process.env.GOOGLE_SHEETS_PROMOTERS_TAB ?? "Promotores",
    // Pestaña de tiendas (usada cuando STORES_SOURCE=sheet).
    tiendasTab: process.env.GOOGLE_SHEETS_TIENDAS_TAB ?? "Tiendas",
  },
};
