// ---------------------------------------------------------------------------
// Integración con Google Sheets (para el administrador).
// ---------------------------------------------------------------------------
// Al hacer check-out de una visita, se agrega una fila con los datos al Sheet.
// Autenticación mediante Google Service Account (archivo de credenciales JSON):
//
//   1. En Google Cloud, crea un Service Account y descarga su clave JSON.
//   2. Habilita la "Google Sheets API" en el proyecto.
//   3. Comparte el documento de Sheets con el email del Service Account
//      (client_email del JSON), con permiso de edición.
//   4. Configura en .env:
//        GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
//        GOOGLE_SHEETS_ID=<id del documento>
//        GOOGLE_SHEETS_TAB=Visitas
//
// Si falta configuración, la integración se omite (no rompe el check-out).
import { existsSync } from "node:fs";
import { google } from "googleapis";
import { config } from "./config.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let sheetsClientPromise = null;

function isConfigured() {
  return Boolean(config.sheets.keyFile && config.sheets.spreadsheetId);
}

// Cliente de Sheets autenticado con el Service Account (lazy + cacheado).
async function getSheetsClient() {
  if (!sheetsClientPromise) {
    if (!existsSync(config.sheets.keyFile)) {
      throw new Error(`No se encontró el archivo de credenciales: ${config.sheets.keyFile}`);
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: config.sheets.keyFile,
      scopes: SCOPES,
    });
    sheetsClientPromise = auth.getClient().then((authClient) =>
      google.sheets({ version: "v4", auth: authClient })
    );
  }
  return sheetsClientPromise;
}

// Agrega una fila con los datos de la visita completada. Best-effort: nunca
// lanza hacia el caller (registra el error y sigue), para no afectar al
// check-out del promotor.
export async function appendVisitRow({ promoter, store, record }) {
  if (!isConfigured()) {
    console.warn("[sheets] Integración no configurada (falta keyFile o spreadsheetId); se omite.");
    return { skipped: true };
  }
  try {
    const sheets = await getSheetsClient();
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
