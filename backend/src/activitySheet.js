// ---------------------------------------------------------------------------
// Resumen del gerente desde el Sheet de auditoría (para DESARROLLO LOCAL).
// ---------------------------------------------------------------------------
// En producción, el resumen del gerente lee la base de datos (VisitRecord),
// que ahí SÍ tiene la actividad real. En una copia local esa base está vacía
// (es otra base de datos, no la de producción), así que no hay forma de ver
// actividad real sin esto: reconstruimos las "visitas del día" a partir de la
// pestaña de auditoría que el check-out ya escribe en el Sheet (ver
// appendVisitRow en sheets.js) y las alimentamos al MISMO agregador puro
// (managerSummary.js) que usa la ruta real. Actívalo con VISITS_SOURCE=sheet.
//
// LIMITACIÓN CONOCIDA: esa pestaña solo registra visitas ya CERRADAS (el
// check-out completo es lo único que se escribe ahí). Por eso, con esta
// fuente, ningún promotor aparecerá "en tienda" (checked-in abierto): todas
// las filas se tratan como `status: "checked-out"`.
//
// Las columnas se leen por POSICIÓN, no por el texto del encabezado: deben
// coincidir exactamente con el orden que escribe appendVisitRow en sheets.js
// (registrado_en, id_promotor, nombre, tienda, hora_entrada, hora_salida,
// rollos, cubetas). Los encabezados visibles en el Sheet pueden decir otra
// cosa (quedaron de un diseño anterior); no se usan para parsear.
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { dayKeyOf } from "./businessDay.js";
import { getAllPromotersFromSheet } from "./promotersSheet.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

let clientPromise = null;

function isConfigured() {
  return Boolean((config.sheets.json || config.sheets.keyFile) && config.sheets.spreadsheetId);
}

function loadCredentials() {
  if (config.sheets.json) return JSON.parse(config.sheets.json);
  if (config.sheets.keyFile) {
    if (!existsSync(config.sheets.keyFile)) throw new Error(`No se encontró ${config.sheets.keyFile}`);
    return JSON.parse(readFileSync(config.sheets.keyFile, "utf8"));
  }
  throw new Error("Sin credenciales de Service Account para leer la actividad del Sheet.");
}

function getClient() {
  if (!clientPromise) {
    const auth = new google.auth.GoogleAuth({ credentials: loadCredentials(), scopes: SCOPES });
    clientPromise = auth.getClient().then((c) => google.sheets({ version: "v4", auth: c }));
  }
  return clientPromise;
}

function slugify(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Lee TODAS las filas de la pestaña de auditoría y las convierte a la misma
// forma que summarizeVisitRows() espera de una fila de VisitRecord+Prisma
// (promoter/store incluidos), filtrando por el rango de días de negocio
// pedido ({from, to}, ambos "YYYY-MM-DD" inclusive).
export async function fetchVisitRowsFromSheet({ from, to }) {
  if (!isConfigured()) {
    console.warn("[activitySheet] Sin credenciales/spreadsheetId; se omite (0 visitas).");
    return [];
  }

  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${config.sheets.actividadTab}!A1:H20000`,
  });
  const rows = res.data.values ?? [];

  // Catálogo local de tiendas (ya sincronizado desde el Sheet por el llamador)
  // para resolver "nombre de tienda" -> { id, estado, lat, lng }.
  const stores = await prisma.store.findMany();
  const storeByName = new Map(stores.map((s) => [s.name.trim().toLowerCase(), s]));
  // Promotores del Sheet (NO de la base local: en desarrollo, un promotor
  // puede tener actividad importada del Sheet sin haber iniciado sesión nunca
  // en este backend, así que su fila local ni existe), para saber a qué
  // SUPERVISOR pertenece cada uno — el Sheet de auditoría no trae esa columna.
  const promotersById = await getAllPromotersFromSheet();

  const out = [];
  // Fila 0 es el encabezado; los datos empiezan en la fila 1.
  for (let r = 1; r < rows.length; r++) {
    const [registradoEn, promoterId, promoterName, storeName, horaEntrada, horaSalida, rollosRaw, cubetasRaw] = rows[r] || [];
    if (!promoterId || !storeName) continue; // fila vacía/incompleta

    const checkInTime = horaEntrada || registradoEn || null;
    const rowDay = dayKeyOf(new Date(checkInTime || registradoEn));
    if (rowDay < from || rowDay > to) continue; // comparación lexicográfica válida en "YYYY-MM-DD"

    const match = storeByName.get(String(storeName).trim().toLowerCase());
    const storeId = match?.id ?? slugify(storeName);

    out.push({
      day: rowDay,
      promoterId: String(promoterId).trim(),
      promoter: { name: promoterName || promoterId, supervisor: promotersById.get(String(promoterId).trim())?.supervisor ?? null },
      storeId,
      store: match
        ? { name: match.name, estado: match.estado, lat: match.lat, lng: match.lng }
        : { name: storeName, estado: null, lat: null, lng: null },
      // Esta pestaña solo registra check-outs completos: no hay forma de ver
      // aquí a un promotor que sigue "en tienda" (checked-in abierto).
      status: "checked-out",
      rollos: Number(rollosRaw) || 0,
      cubetas: Number(cubetasRaw) || 0,
      checkInTime,
      checkOutTime: horaSalida || null,
    });
  }
  return out;
}
