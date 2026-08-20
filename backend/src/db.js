// ---------------------------------------------------------------------------
// Capa de datos — consultas reales con Prisma (SQLite por defecto).
// ---------------------------------------------------------------------------
// Sustituye a la versión estática en memoria. Mantiene la MISMA interfaz que
// consumen las rutas, así que routes/auth no cambian. La foto de la visita se
// persiste (Base64) en la columna VisitRecord.photo.
import { prisma, withWriteRetry } from "./prisma.js";
import { config } from "./config.js";
import { findPromoterInSheet } from "./promotersSheet.js";
import { ensureStoresSynced } from "./storesSheet.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// --- Promotores ------------------------------------------------------------

// Devuelve el promotor con su hash de contraseña (para verificar el login).
// Con AUTH_SOURCE=sheet lee del Google Sheet (hash bcrypt en la columna
// CONTRASEÑA); de lo contrario, de la base local (Prisma). En ambos casos
// devuelve la misma forma { id, name, location, supervisor, password }.
export async function findPromoterById(promoterId) {
  if (config.authSource === "sheet") {
    return findPromoterInSheet(promoterId);
  }
  return prisma.promoter.findUnique({ where: { id: promoterId } });
}

// --- Tiendas (catálogo global) --------------------------------------------

// Todas las tiendas del catálogo. El filtrado por cercanía se hace en la ruta.
// Con STORES_SOURCE=sheet, primero sincroniza desde la pestaña Tiendas del Sheet.
export async function getAllStores() {
  if (config.storesSource === "sheet") await ensureStoresSynced();
  return prisma.store.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, address: true, lat: true, lng: true },
  });
}

export async function getStore(storeId) {
  if (config.storesSource === "sheet") await ensureStoresSynced();
  return prisma.store.findUnique({ where: { id: storeId } });
}

// --- Visitas ---------------------------------------------------------------

export async function fetchTodayVisits(promoterId) {
  const rows = await prisma.visitRecord.findMany({
    where: { promoterId, day: todayKey() },
  });
  const out = {};
  for (const r of rows) out[r.storeId] = r;
  return out;
}

export async function getVisit(promoterId, storeId) {
  return prisma.visitRecord.findUnique({
    where: { promoterId_storeId_day: { promoterId, storeId, day: todayKey() } },
  });
}

// Crea o actualiza (upsert) el registro de visita del día. Convierte los campos
// de fecha a Date para Prisma. Devuelve el registro persistido.
export async function submitVisitReport(promoterId, storeId, patch) {
  const day = todayKey();
  const data = { ...patch };
  if (typeof data.checkInTime === "string") data.checkInTime = new Date(data.checkInTime);
  if (typeof data.checkOutTime === "string") data.checkOutTime = new Date(data.checkOutTime);

  // withWriteRetry: reintenta ante bloqueos de SQLite bajo carga concurrente.
  return withWriteRetry(() =>
    prisma.visitRecord.upsert({
      where: { promoterId_storeId_day: { promoterId, storeId, day } },
      create: { promoterId, storeId, day, status: "checked-in", ...data },
      update: { ...data },
    })
  );
}
