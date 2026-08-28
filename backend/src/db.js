// ---------------------------------------------------------------------------
// Capa de datos — consultas reales con Prisma (SQLite por defecto).
// ---------------------------------------------------------------------------
// Sustituye a la versión estática en memoria. Mantiene la MISMA interfaz que
// consumen las rutas, así que routes/auth no cambian. La foto de la visita se
// persiste (Base64) en la columna VisitRecord.photo.
import { prisma, withWriteRetry } from "./prisma.js";
import { config } from "./config.js";
import { findPromoterInSheet, getAllPromotersFromSheet } from "./promotersSheet.js";
import { ensureStoresSynced } from "./storesSheet.js";
import { summarizeVisitRows } from "./managerSummary.js";
import { fetchVisitRowsFromSheet } from "./activitySheet.js";
import { todayKey, resolveRange } from "./businessDay.js";
import { getPromoterGoal, getStoreGoal, setPromoterGoal as setPromoterGoalInSheet } from "./goalsSheet.js";
import { appendNotification, hasGoalNotification } from "./notificationsSheet.js";
import { appendCompetitionRow } from "./competitionSheet.js";

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

// Con AUTH_SOURCE=sheet los promotores viven en el Google Sheet, no en
// Postgres, pero VisitRecord/CompetitionReport tienen una llave foránea a
// Promoter. Asegura que exista su fila local (con el hash del Sheet) para no
// violar esa restricción al guardar. Idempotente: si ya existe, no toca nada.
async function ensurePromoterExistsLocally(promoterId) {
  if (config.authSource !== "sheet") return;
  const p = await findPromoterInSheet(promoterId);
  if (!p) return;
  // `update` refleja los mismos campos que `create`: así, si el promotor ya
  // tenía fila local (de un login anterior), cambios posteriores en el Sheet
  // (ubicación, supervisor, estado) sí se propagan en el siguiente check-in.
  const fields = {
    name: p.name || p.id,
    location: p.location ?? null,
    supervisor: p.supervisor ?? null,
    estado: p.estado ?? null,
  };
  await prisma.promoter.upsert({
    where: { id: p.id },
    update: fields,
    create: { id: p.id, password: p.password ?? "", ...fields },
  });
}

// Crea o actualiza (upsert) el registro de visita del día. Convierte los campos
// de fecha a Date para Prisma. Devuelve el registro persistido.
export async function submitVisitReport(promoterId, storeId, patch) {
  const day = todayKey();
  const data = { ...patch };
  if (typeof data.checkInTime === "string") data.checkInTime = new Date(data.checkInTime);
  if (typeof data.checkOutTime === "string") data.checkOutTime = new Date(data.checkOutTime);

  await ensurePromoterExistsLocally(promoterId);

  // withWriteRetry: reintenta ante bloqueos de SQLite bajo carga concurrente.
  return withWriteRetry(() =>
    prisma.visitRecord.upsert({
      where: { promoterId_storeId_day: { promoterId, storeId, day } },
      create: { promoterId, storeId, day, status: "checked-in", ...data },
      update: { ...data },
    })
  );
}

// --- Reportes de competencia -------------------------------------------------
// Guarda el reporte COMPLETO (con fotos) en la base de datos y, best-effort,
// una fila-resumen en el Sheet "Competencia" para que el admin lo revise sin
// abrir la app.
export async function createCompetitionReport(promoterId, { marca, descripcion, photos }) {
  await ensurePromoterExistsLocally(promoterId);

  const report = await withWriteRetry(() =>
    prisma.competitionReport.create({
      data: { promoterId, marca, descripcion, photos: photos?.length ? JSON.stringify(photos) : null },
    })
  );

  // appendCompetitionRow nunca lanza (best-effort): el reporte ya quedó a
  // salvo en la base de datos aunque el Sheet falle.
  const promoter = await findPromoterById(promoterId);
  await appendCompetitionRow({
    promoterId,
    promoterName: promoter?.name || promoterId,
    marca,
    descripcion,
    photoCount: photos?.length || 0,
  });

  return report;
}

// Reportes de Competencia para el panel del gerente/admin (o de un supervisor,
// acotado a SU equipo). Más recientes primero. Las fotos se guardan como JSON
// en la base de datos (ver CompetitionReport.photos) — se devuelven ya
// parseadas como arreglo.
export async function getCompetitionReports({ supervisorId, limit = 200 } = {}) {
  const reports = await prisma.competitionReport.findMany({
    include: { promoter: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const filtered = supervisorId
    ? reports.filter((r) => (r.promoter?.supervisor || "").trim().toLowerCase() === supervisorId)
    : reports;
  return filtered.map((r) => ({
    id: r.id,
    promoterId: r.promoterId,
    promoterName: r.promoter?.name || r.promoterId,
    supervisor: r.promoter?.supervisor || null,
    marca: r.marca,
    descripcion: r.descripcion,
    photos: r.photos ? JSON.parse(r.photos) : [],
    createdAt: r.createdAt,
  }));
}

// --- Resumen para el GERENTE -------------------------------------------------
// Agrega TODAS las visitas de un RANGO de días ("today" | "week" | "month" |
// "year", por defecto "today") y las agrupa por promotor. Calcula el "dinero
// vendido" multiplicando cantidades por los precios de config (PRECIO_ROLLO /
// PRECIO_CUBETA). Devuelve totales globales, el desglose por estado (para las
// gráficas) y un arreglo de promotores activos.
//
// "PROMOTOR ACTIVO" = tiene al menos un registro de visita en el rango (el
// check-in crea el registro), sin importar si ya cerró o sigue en tienda.
//
// `supervisorId` (opcional) restringe el resultado a los promotores de ESE
// supervisor (comparando, sin distinguir mayúsculas, contra la columna
// SUPERVISOR de la pestaña Promotores) — así el tablero de supervisor
// reutiliza exactamente la misma agregación que el del gerente.
export async function getManagerSummary(rangeKey = "today", { supervisorId } = {}) {
  // Asegura que las tiendas (con su ESTADO) estén sincronizadas desde el Sheet.
  if (config.storesSource === "sheet") await ensureStoresSynced();

  const range = resolveRange(rangeKey);

  // Con VISITS_SOURCE=sheet (solo para desarrollo local) reconstruimos las
  // visitas del rango desde la pestaña de auditoría del Sheet, porque la base
  // local no tiene la actividad real (esa vive en el Postgres de producción).
  let rows =
    config.visitsSource === "sheet"
      ? await fetchVisitRowsFromSheet(range)
      : await prisma.visitRecord.findMany({
          where: { day: { gte: range.from, lte: range.to } },
          include: { promoter: true, store: true },
        });

  // Con AUTH_SOURCE=sheet, `promoter` viene del mirror local en Postgres, que
  // solo se refresca en el SIGUIENTE check-in/check-out de cada promotor (ver
  // ensurePromoterExistsLocally) — una visita ya abierta antes de que el admin
  // llenara/corrigiera el estado en el Sheet se quedaría con estado/supervisor
  // desactualizados hasta que esa visita se cierre. Para que el filtro de
  // estado siempre refleje lo que el Sheet dice AHORA (fuente de verdad,
  // editable por el admin), sobreescribimos con una lectura fresca del Sheet
  // (cacheada unos minutos, no golpea la API en cada carga del tablero).
  if (config.authSource === "sheet" && config.visitsSource !== "sheet") {
    const sheetPromoters = await getAllPromotersFromSheet();
    rows = rows.map((r) => {
      const sp = sheetPromoters.get(r.promoterId);
      if (!sp) return r;
      return { ...r, promoter: { ...r.promoter, name: sp.name || r.promoter?.name, supervisor: sp.supervisor ?? r.promoter?.supervisor ?? null, estado: sp.estado ?? null } };
    });
  }

  if (supervisorId) {
    rows = rows.filter((r) => (r.promoter?.supervisor || "").trim().toLowerCase() === supervisorId);
  }

  // La agregación pura vive en managerSummary.js (testeable sin base de datos).
  const summary = summarizeVisitRows(rows, config.prices, range);
  await attachGoalProgress(summary);
  return summary;
}

// Mismo resumen, pero acotado a los promotores de un supervisor.
export async function getSupervisorSummary(supervisorId, rangeKey = "today") {
  return getManagerSummary(rangeKey, { supervisorId });
}

// --- Metas: progreso mensual por promotor -----------------------------------
// Le agrega `goal: { target, achieved, reached }` a cada promotor del resumen
// (o `goal: null` si no tiene meta definida en el Sheet). El acumulado del mes
// se calcula con la MISMA fuente que el resto del tablero (VISITS_SOURCE): así
// en desarrollo local (Sheet) el avance de meta coincide con lo que ya se ve
// en pantalla, y en producción (base de datos) es el acumulado real.
async function attachGoalProgress(summary) {
  const month = resolveRange("month");
  const monthRows =
    config.visitsSource === "sheet"
      ? await fetchVisitRowsFromSheet(month)
      : await prisma.visitRecord.findMany({
          where: { day: { gte: month.from, lte: month.to } },
          select: { promoterId: true, rollos: true, cubetas: true, galones: true },
        });

  const achievedByPromoter = new Map();
  for (const r of monthRows) {
    achievedByPromoter.set(r.promoterId, (achievedByPromoter.get(r.promoterId) || 0) + (r.rollos || 0) + (r.cubetas || 0) + (r.galones || 0));
  }

  for (const p of summary.promoters) {
    const target = await getPromoterGoal(p.id);
    const achieved = achievedByPromoter.get(p.id) ?? 0;
    p.goal = target ? { target, achieved, reached: achieved >= target } : null;
  }
}

// --- Notificaciones disparadas por check-in / check-out ---------------------

// Se llama al hacer CHECK-IN: avisa al supervisor del promotor (si tiene uno)
// con la tienda y el nombre del asesor. Best-effort: nunca lanza.
export async function notifyCheckIn(promoterId, storeId) {
  try {
    const [promoter, store] = await Promise.all([findPromoterById(promoterId), getStore(storeId)]);
    const supervisorId = (promoter?.supervisor || "").trim().toLowerCase();
    if (!supervisorId) return; // sin supervisor asignado, no hay a quién avisar
    await appendNotification({
      tipo: "checkin",
      para: supervisorId,
      idPromotor: promoterId,
      promotor: promoter?.name || promoterId,
      idTienda: storeId,
      tienda: store?.name || storeId,
      detalle: `${promoter?.name || promoterId} hizo check-in en ${store?.name || storeId}.`,
    });
  } catch (e) {
    console.error("[db] notifyCheckIn falló:", e.message);
  }
}

// Unidades (rollos+cubetas) que un promotor lleva vendidas ESTE MES, siempre
// desde la base de datos real (el check-out de un promotor ya escribe ahí sin
// importar VISITS_SOURCE — eso solo afecta cómo se reconstruye la vista del
// gerente/supervisor en desarrollo local).
async function monthToDateUnitsForPromoter(promoterId, month = resolveRange("month")) {
  const sum = await prisma.visitRecord.aggregate({
    where: { promoterId, day: { gte: month.from, lte: month.to } },
    _sum: { rollos: true, cubetas: true, galones: true },
  });
  return (sum._sum.rollos || 0) + (sum._sum.cubetas || 0) + (sum._sum.galones || 0);
}

// Meta y avance del MES del promotor logueado — lo consume su propia app
// ("Mi meta de ventas" en el dashboard de campo).
export async function getMyGoalProgress(promoterId) {
  const target = await getPromoterGoal(promoterId);
  if (!target) return null;
  const achieved = await monthToDateUnitsForPromoter(promoterId);
  return { target, achieved, reached: achieved >= target };
}

// Fija (crea o reemplaza) la meta MENSUAL de un promotor, en unidades. Lo usa
// el botón "Meta" del tablero del gerente/admin. `nombre` es solo para que la
// fila del Sheet sea legible a simple vista.
export async function setPromoterGoal(promoterId, meta, nombre) {
  await setPromoterGoalInSheet(promoterId, meta, nombre);
}

// Se llama al hacer CHECK-OUT: si el promotor o la tienda ya llegaron a su
// meta MENSUAL (unidades = rollos+cubetas), notifica UNA sola vez por mes
// (idempotente vía hasGoalNotification, no por detección exacta del cruce).
export async function checkAndNotifyGoals(promoterId, storeId) {
  try {
    const month = resolveRange("month");
    const periodo = month.from.slice(0, 7); // "YYYY-MM"

    const promoterGoal = await getPromoterGoal(promoterId);
    if (promoterGoal) {
      const achieved = await monthToDateUnitsForPromoter(promoterId, month);
      if (achieved >= promoterGoal && !(await hasGoalNotification({ tipo: "promoter_goal", id: promoterId, periodo }))) {
        const promoter = await findPromoterById(promoterId);
        const supervisorId = (promoter?.supervisor || "").trim().toLowerCase();
        await appendNotification({
          tipo: "promoter_goal",
          para: supervisorId || "admin",
          idPromotor: promoterId,
          promotor: promoter?.name || promoterId,
          periodo,
          detalle: `${promoter?.name || promoterId} alcanzó su meta mensual (${achieved}/${promoterGoal} unidades).`,
        });
      }
    }

    const storeGoal = await getStoreGoal(storeId);
    if (storeGoal) {
      const sum = await prisma.visitRecord.aggregate({
        where: { storeId, day: { gte: month.from, lte: month.to } },
        _sum: { rollos: true, cubetas: true, galones: true },
      });
      const achieved = (sum._sum.rollos || 0) + (sum._sum.cubetas || 0) + (sum._sum.galones || 0);
      if (achieved >= storeGoal && !(await hasGoalNotification({ tipo: "store_goal", id: storeId, periodo }))) {
        const store = await getStore(storeId);
        await appendNotification({
          tipo: "store_goal",
          para: "admin",
          idTienda: storeId,
          tienda: store?.name || storeId,
          periodo,
          detalle: `${store?.name || storeId} alcanzó su meta mensual (${achieved}/${storeGoal} unidades).`,
        });
      }
    }
  } catch (e) {
    console.error("[db] checkAndNotifyGoals falló:", e.message);
  }
}

// --- Perfil del promotor (historial de check-in/check-out) ------------------
// Últimos `limit` registros de visita (con tienda incluida) + las tiendas a
// las que va con más frecuencia. Se usa desde el tablero del gerente/admin y
// del supervisor (que solo puede ver a SUS promotores; esa validación vive en
// la ruta, no aquí).
export async function getPromoterProfile(promoterId, limit = 200) {
  const promoter = await findPromoterById(promoterId);
  if (!promoter) return null;

  const history = await prisma.visitRecord.findMany({
    where: { promoterId },
    include: { store: true },
    orderBy: [{ day: "desc" }, { checkInTime: "desc" }],
    take: limit,
  });

  const storeCounts = new Map();
  for (const v of history) {
    const key = v.storeId;
    if (!storeCounts.has(key)) storeCounts.set(key, { storeId: key, storeName: v.store?.name || key, visits: 0 });
    storeCounts.get(key).visits += 1;
  }
  const frequentStores = [...storeCounts.values()].sort((a, b) => b.visits - a.visits).slice(0, 8);

  return {
    id: promoter.id,
    name: promoter.name,
    location: promoter.location ?? null,
    supervisor: promoter.supervisor ?? null,
    frequentStores,
    history: history.map((v) => ({
      day: v.day,
      storeId: v.storeId,
      storeName: v.store?.name || v.storeId,
      status: v.status,
      checkInTime: v.checkInTime,
      checkOutTime: v.checkOutTime,
      rollos: v.rollos,
      cubetas: v.cubetas,
      galones: v.galones,
    })),
  };
}

// ¿El promotor `promoterId` es supervisado por `supervisorId` (ID del
// supervisor, ya en minúsculas)? Se usa para que un supervisor no pueda ver
// el perfil de un promotor que no es suyo.
export async function promoterBelongsToSupervisor(promoterId, supervisorId) {
  const promoter = await findPromoterById(promoterId);
  return (promoter?.supervisor || "").trim().toLowerCase() === supervisorId;
}