import { google } from "googleapis";

// ---------------------------------------------------------------------------
// Inicialización y Gobernanza con Google Sheets
// ---------------------------------------------------------------------------
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Validador de configuración basado en las variables .env.local
function isConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_SHEET_ID
  );
}

// Inicialización de cliente cacheado sin depender de archivos externos
async function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Next.js requiere escapar los saltos de línea en las llaves privadas en producción
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error("Faltan credenciales de Google Service Account en el archivo .env");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: SCOPES,
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient as any });
}

// ---------------------------------------------------------------------------
// NUEVO MÓDULO: Inserción de Retroalimentación (Feedback)
// ---------------------------------------------------------------------------
interface FeedbackData {
  recordId: string;
  timestamp: string;
  promoterId: string;
  promoterName: string;
  branch: string;
  description: string;
  userAgent: string;
}

export async function appendFeedbackRow({
  recordId,
  timestamp,
  promoterId,
  promoterName,
  branch,
  description,
  userAgent
}: FeedbackData) {
  if (!isConfigured()) {
    console.warn("[sheets] Integración no configurada (faltan variables .env); omitiendo reporte de feedback.");
    return { skipped: true };
  }
  
  try {
    const sheets = await getSheetsClient();
    
    const row = [
      recordId,
      timestamp,
      promoterId,
      promoterName,
      branch,
      description,
      userAgent
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Feedback!A1', 
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    
    return { appended: true };
  } catch (err: any) {
    console.error("[sheets] Error crítico al agregar feedback:", err.message);
    return { error: err.message };
  }
}