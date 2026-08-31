// ---------------------------------------------------------------------------
// "Día" del negocio en hora de México (NO UTC).
// ---------------------------------------------------------------------------
// Con UTC, cualquier check-in/check-out después de ~18:00 hora local ya cae en
// la fecha UTC del día siguiente, corriendo esa actividad al resumen
// equivocado. Todo el sistema (check-in, check-out, resumen del gerente, e
// importación desde el Sheet) usa esta misma función para que el "día" sea
// consistente en todos lados.
const BUSINESS_TIMEZONE = "America/Mexico_City";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dayKeyOf(date) {
  return dayFormatter.format(date);
}

export function todayKey() {
  return dayKeyOf(new Date());
}

// Fecha+hora completas en hora de México, como texto plano "YYYY-MM-DD HH:mm:ss"
// (sin "Z" ni offset) — para escribir en el Sheet. A propósito NO es ISO: si
// lleváramos el offset, Sheets/Excel a veces lo re-interpreta o lo ignora al
// graficar/ordenar; como texto plano en hora local, lo que ves es lo que es.
const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

export function formatMexicoDateTime(date) {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (Number.isNaN(d?.getTime?.())) return "";
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// Inverso de formatMexicoDateTime: toma "YYYY-MM-DD HH:mm:ss" (hora de
// México, sin offset) y devuelve el instante real (Date, en UTC internamente
// como cualquier Date de JS). No asume "-6" a mano: calcula el offset real de
// América/Ciudad_de_México en ese instante vía Intl, por si algún día cambia.
export function parseMexicoDateTime(str) {
  if (!str) return null;
  const [datePart, timePart] = String(str).trim().split(" ");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  const [h, min, s] = (timePart || "00:00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  const guessUtc = new Date(Date.UTC(y, m - 1, d, h || 0, min || 0, s || 0));
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(guessUtc).map((p) => [p.type, p.value]));
  const guessAsMexicoWallClock = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  const offsetMs = guessUtc.getTime() - guessAsMexicoWallClock;
  return new Date(guessUtc.getTime() + offsetMs);
}

// Interpreta una fecha/hora tal como viene guardada en el Sheet, sin importar
// si es una fila vieja (ISO/UTC, con "T" y "Z") o una nueva (hora de México en
// texto plano, escrita por formatMexicoDateTime) — para no romper filas
// escritas antes de este cambio. Devuelve un Date real o null.
export function parseSheetDateTime(str) {
  if (!str) return null;
  if (String(str).includes("T")) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseMexicoDateTime(str);
}

// Día de la semana (0=lunes ... 6=domingo) de una clave "YYYY-MM-DD". Se
// calcula con Date.UTC solo como truco aritmético sobre el triple año/mes/día
// (ya en hora de México); no representa un instante real, así que no hay
// conversión de zona horaria que pueda salir mal aquí.
function isoWeekdayOf(day) {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo..6=sábado
  return (dow + 6) % 7; // 0=lunes..6=domingo
}

function startOfWeek(day) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - isoWeekdayOf(day));
  return date.toISOString().slice(0, 10);
}

function startOfMonth(day) {
  const [y, m] = day.split("-");
  return `${y}-${m}-01`;
}

function startOfYear(day) {
  const [y] = day.split("-");
  return `${y}-01-01`;
}

// Suma (o resta, con n negativo) días a una clave "YYYY-MM-DD". Mismo truco
// de Date.UTC que isoWeekdayOf/startOfWeek: es aritmética sobre el triple
// año/mes/día, no un instante real, así que no hay zona horaria que cuidar.
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function startOfPrevMonth(day) {
  const [y, m] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// "YYYY-MM-DD" válido (fecha real, no solo el formato) — usado para validar
// las fechas del rango "custom" antes de confiar en ellas. Aritmética pura de
// calendario (sin convertir a hora de México): solo confirma que el triple
// año/mes/día exista de verdad (rechaza cosas como "2026-02-30").
function isValidDayKey(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""))) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Resuelve las palabras clave del dropdown de rango del tablero del gerente a
// un rango de días [from, to] (ambos inclusive, en hora de México). Rango
// desconocido -> "today" (mismo comportamiento que antes de tener rangos).
// `rangeKey === "custom"` usa `custom.from`/`custom.to` tal cual (ambas deben
// ser "YYYY-MM-DD" válidas y from<=to) — si faltan o son inválidas, cae a
// "today" igual que cualquier otro rango desconocido.
export function resolveRange(rangeKey, custom = {}) {
  const today = todayKey();
  if (rangeKey === "custom") {
    const { from, to } = custom;
    if (isValidDayKey(from) && isValidDayKey(to) && from <= to) return { from, to };
    return { from: today, to: today };
  }
  switch (rangeKey) {
    case "week":
      return { from: startOfWeek(today), to: today };
    case "month":
      return { from: startOfMonth(today), to: today };
    case "year":
      return { from: startOfYear(today), to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last_week": {
      const thisWeekStart = startOfWeek(today);
      return { from: addDays(thisWeekStart, -7), to: addDays(thisWeekStart, -1) };
    }
    case "last_month": {
      const from = startOfPrevMonth(today);
      return { from, to: addDays(startOfMonth(today), -1) };
    }
    case "last_year": {
      const prevYear = String(Number(today.slice(0, 4)) - 1);
      return { from: `${prevYear}-01-01`, to: `${prevYear}-12-31` };
    }
    case "today":
    default:
      return { from: today, to: today };
  }
}
