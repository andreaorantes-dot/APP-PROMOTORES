// ---------------------------------------------------------------------------
// Integración con Google Sheets (para el administrador).
// ---------------------------------------------------------------------------
// Al hacer check-out de una visita, se agrega una fila con los datos al Sheet.
// Autenticación mediante un Google Service Account. Dale las credenciales de
// UNA de estas dos formas:
//   - GOOGLE_SERVICE_ACCOUNT_JSON = el contenido JSON completo (ideal para
//     variables de entorno / Secret Files en la nube), o
//   - GOOGLE_SERVICE_ACCOUNT_KEY_FILE = ruta a un archivo .json.
// Además: GOOGLE_SHEETS_ID (id del documento) y GOOGLE_SHEETS_TAB (pestaña).
//
// Si falta configuración o algo falla, la integración se omite y el check-out
// NO se ve afectado (best-effort).
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";
import { config } from "./config.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Encabezados de la hoja (se crean solos si la pestaña está vacía).
const HEADERS = [
  "registrado_en",
  "id_promotor",
  "nombre",
  "tienda",
  "hora_entrada",
  "hora_salida",
  "rollos",
  "cubetas",
];

let sheetsClientPromise = null;
let headerEnsured = false;

function isConfigured() {
  return Boolean((config.sheets.json || config.sheets.keyFile) && config.sheets.spreadsheetId);
}

// Devuelve el objeto de credenciales del Service Account (desde el JSON en la
// variable de entorno o desde el archivo). Lanza si no puede obtenerlo.
function loadCredentials() {
  if (config.sheets.json) {
    return JSON.parse(config.sheets.json);
  }
  if (config.sheets.keyFile) {
    if (!existsSync(config.sheets.keyFile)) {
      throw new Error(`No se encontró el archivo de credenciales: ${config.sheets.keyFile}`);
    }
    return JSON.parse(readFileSync(config.sheets.keyFile, "utf8"));
  }
  throw new Error("Sin credenciales de Service Account (define GOOGLE_SERVICE_ACCOUNT_JSON o _KEY_FILE).");
}

// Cliente de Sheets autenticado con el Service Account (lazy + cacheado).
async function getSheetsClient() {
  if (!sheetsClientPromise) {
    const credentials = loadCredentials();
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    sheetsClientPromise = auth.getClient().then((authClient) =>
      google.sheets({ version: "v4", auth: authClient })
    );
  }
  return sheetsClientPromise;
}

// Escribe la fila de encabezados si la pestaña está vacía (una vez por proceso).
async function ensureHeader(sheets) {
  if (headerEnsured) return;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${config.sheets.tab}!A1:H1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${config.sheets.tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
  headerEnsured = true;
}

// Agrega una fila con los datos de la visita completada. Best-effort: nunca
// lanza hacia el caller (registra el error y sigue), para no afectar al
// check-out del promotor.
export async function appendVisitRow({ promoter, store, record }) {
  if (!isConfigured()) {
    console.warn("[sheets] Integración no configurada (faltan credenciales o spreadsheetId); se omite.");
    return { skipped: true };
  }
  try {
    const sheets = await getSheetsClient();
    await ensureHeader(sheets);
    const row = [
      new Date().toISOString(), // registrado_en
      promoter.id, // ID promotor
      promoter.name, // Nombre promotor
      store?.name ?? record.storeId, // Tienda
      record.checkInTime ?? "", // Hora entrada
      record.checkOutTime ?? "", // Hora salida
      record.rollos ?? 0, // Inventario: rollos
      record.cubetas ?? 0, // Inventario: cubetas
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${config.sheets.tab}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return { appended: true };
  } catch (err) {
    console.error("[sheets] No se pudo agregar la fila de la visita:", err.message);
    return { error: err.message };
  }
}

// Diagnóstico para verificar la conexión sin depender de un check-out real.
// Devuelve si está configurado, el email del Service Account, y si puede leer
// el documento (título de la hoja) o el error concreto.
export async function checkSheetsConnection() {
  if (!isConfigured()) {
    return { configured: false, reason: "Faltan credenciales o GOOGLE_SHEETS_ID." };
  }
  let clientEmail;
  try {
    clientEmail = loadCredentials().client_email;
  } catch (e) {
    return { configured: true, ok: false, error: `Credenciales inválidas: ${e.message}` };
  }
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: config.sheets.spreadsheetId });
    await ensureHeader(sheets);
    return {
      configured: true,
      ok: true,
      serviceAccountEmail: clientEmail,
      spreadsheetTitle: meta.data.properties?.title,
      tab: config.sheets.tab,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      serviceAccountEmail: clientEmail,
      error: err.message,
      hint: "¿Compartiste el documento con el email del Service Account (como Editor) y habilitaste la Google Sheets API?",
    };
  }
}
