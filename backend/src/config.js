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
  // Se autentica con un Service Account (archivo JSON). Si no está configurado,
  // la integración se omite silenciosamente (no bloquea el check-out).
  sheets: {
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "", // ruta al JSON
    spreadsheetId: process.env.GOOGLE_SHEETS_ID ?? "",
    tab: process.env.GOOGLE_SHEETS_TAB ?? "Visitas",
  },
};
