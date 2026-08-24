// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------
// All requests use `credentials: "include"` so the browser sends the HttpOnly
// session cookie issued by the backend. The SPA reads no token to do this —
// the cookie is invisible to JS, which is exactly what protects it from XSS.
//
// `getAccessToken()` is consulted only as a fallback for the pure-SPA/in-memory
// mode; when the backend uses cookie sessions it returns null and no Authorization
// header is sent.

import { API_BASE } from "../config.js";
import { getAccessToken } from "./tokenStore.js";

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Lee la cookie CSRF (legible por JS a propósito) para reenviarla en un header.
function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function request(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Protección CSRF (double-submit): en métodos que cambian estado, envía el
  // token de la cookie en el header X-CSRF-Token; el backend lo compara con el
  // claim firmado dentro del JWT de sesión.
  if (!SAFE_METHODS.has(method.toUpperCase())) {
    const csrf = readCsrfCookie();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  // Fallback only: cookie-session mode leaves this null.
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include", // send/receive the HttpOnly session cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = (data && data.message) || res.statusText || "Error de red";
    throw new ApiError(res.status, message);
  }
  return data;
}

export const api = {
  // --- Auth ---------------------------------------------------------------
  // Login con ID de promotor + contraseña. El backend verifica con bcrypt y
  // responde `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict`.
  login: (promoterId, password) =>
    request("/login", { method: "POST", body: { promoterId, password } }),

  // NOTE: check-in ahora recibe { coords, photo } — la foto (Base64) es
  // obligatoria y viaja cifrada en la cola si se genera sin red.

  // Who am I? Returns the current promoter (sin tiendas — ver nearbyStores).
  session: (signal) => request("/auth/session", { signal }),

  logout: () => request("/auth/logout", { method: "POST" }),

  // Tiendas cercanas a la ubicación GPS del promotor (Haversine en el servidor,
  // radio ~2 km). Devuelve { radius, stores: [{...store, distance}] }.
  nearbyStores: (lat, lng, signal) =>
    request(`/stores?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, { signal }),

  // Todas las tiendas del catálogo (para pintarlas en el mapa de Inicio).
  allStores: (signal) => request("/stores/all", { signal }),

  // --- Visits (server-authoritative) -------------------------------------
  // The client sends its coordinates, but the SERVER re-validates distance,
  // time, and identity before persisting. Never trust the browser for this.
  checkIn: (storeId, { coords, photo }) =>
    request(`/visits/${encodeURIComponent(storeId)}/check-in`, {
      method: "POST",
      body: { coords, photo },
    }),

  checkOut: (storeId, { coords, rollos, cubetas }) =>
    request(`/visits/${encodeURIComponent(storeId)}/check-out`, {
      method: "POST",
      body: { coords, rollos, cubetas },
    }),

  // Today's visit records for the signed-in promoter.
  visitsToday: (signal) => request("/visits/today", { signal }),

  // Meta mensual (unidades) del promotor logueado y su avance del mes.
  // { target, achieved, reached } o null si no tiene meta asignada.
  myGoal: (signal) => request("/visits/my-goal", { signal }),

  // --- Retroalimentación --------------------------------------------------
  // Envía un reporte de error/problema del asesor. Se guarda como una fila en
  // la pestaña de retroalimentación del Google Sheet del administrador.
  sendFeedback: ({ idPromotor, nombre, sucursal, descripcion, ubicacion }) =>
    request("/feedback", {
      method: "POST",
      body: { idPromotor, nombre, sucursal, descripcion, ubicacion },
    }),

  // --- Competencia ---------------------------------------------------------
  // Reporta una acción/estrategia de la competencia (marca, descripción, hasta
  // 5 fotos como data URL). Se guarda en la base de datos y en una pestaña del
  // Sheet ("Competencia") como resumen.
  sendCompetitionReport: ({ marca, descripcion, fotos }) =>
    request("/competition", {
      method: "POST",
      body: { marca, descripcion, fotos },
    }),

  // --- Gerente / Admin ----------------------------------------------------
  // Resumen para el tablero del gerente (requiere rol gerente/admin en el
  // servidor). `range` es "today" | "week" | "month" | "year"; sin él usa "today".
  managerSummary: (range, signal) =>
    request(`/manager/summary${range ? `?range=${encodeURIComponent(range)}` : ""}`, { signal }),

  // Fija la meta mensual (unidades) de un promotor. Solo admin/gerente.
  setPromoterGoal: (promoterId, meta, nombre) =>
    request(`/manager/promoter/${encodeURIComponent(promoterId)}/goal`, {
      method: "PUT",
      body: { meta, nombre },
    }),

  // --- Supervisor -----------------------------------------------------------
  // Mismo resumen que el del gerente, pero acotado a SUS promotores (lo filtra
  // el servidor por el ID de sesión del supervisor).
  supervisorSummary: (range, signal) =>
    request(`/supervisor/summary${range ? `?range=${encodeURIComponent(range)}` : ""}`, { signal }),

  // --- Notificaciones (campana) ---------------------------------------------
  // Admin/gerente reciben las de "admin" + un insight de Top 5 en vivo;
  // supervisor recibe las suyas (check-in de sus promotores, metas alcanzadas).
  notifications: (signal) => request("/notifications", { signal }),

  // --- Perfil de promotor (historial) ---------------------------------------
  promoterProfile: (promoterId, signal) =>
    request(`/promoters/${encodeURIComponent(promoterId)}/profile`, { signal }),
};

export { ApiError };
