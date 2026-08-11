// Instancia única del cliente Prisma para toda la app.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// --- Concurrencia en SQLite -------------------------------------------------
// Con muchos check-in simultáneos, el modo por defecto de SQLite serializa las
// escrituras y puede lanzar "database is locked". Activamos WAL (permite
// lectores concurrentes mientras se escribe) y un busy_timeout para que las
// escrituras esperen en vez de fallar. WAL es persistente (queda en el archivo).
// En PostgreSQL estas PRAGMA se ignoran silenciosamente (no aplica).
export async function initDb() {
  // Algunas PRAGMA devuelven una fila (p.ej. journal_mode, busy_timeout), así que
  // se usa $queryRawUnsafe. Se ejecutan por separado para que un fallo no bloquee
  // a los demás. En PostgreSQL fallan silenciosamente (no aplica).
  for (const pragma of ["PRAGMA journal_mode=WAL;", "PRAGMA busy_timeout=8000;", "PRAGMA synchronous=NORMAL;"]) {
    try {
      const r = await prisma.$queryRawUnsafe(pragma);
      if (pragma.includes("journal_mode")) console.log("[db] journal_mode:", JSON.stringify(r));
    } catch (e) {
      console.warn(`[db] ${pragma} no aplicada:`, e.message);
    }
  }
}

// Reintenta una operación de escritura ante errores transitorios de bloqueo
// (SQLITE_BUSY / write conflict). Backoff corto con pequeño jitter por intento.
export async function withWriteRetry(fn, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || "");
      const transient =
        e?.code === "P2034" || // write conflict / deadlock
        /database is locked|SQLITE_BUSY|locked/i.test(msg);
      if (!transient) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 40 * (i + 1) + (i * 7) % 23));
    }
  }
  throw lastErr;
}

// Cierre limpio de la conexión al terminar el proceso.
async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
