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
    case "today":
    default:
      return { from: today, to: today };
  }
}
