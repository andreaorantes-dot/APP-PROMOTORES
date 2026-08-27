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

// Resuelve las palabras clave del dropdown de rango del tablero del gerente a
// un rango de días [from, to] (ambos inclusive, en hora de México). Rango
// desconocido -> "today" (mismo comportamiento que antes de tener rangos).
export function resolveRange(rangeKey) {
  const today = todayKey();
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
