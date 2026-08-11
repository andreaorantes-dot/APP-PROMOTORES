// Semilla desde los CSV reales de Protexa.
//  - Promotores.csv (UTF-8, coma): id, nombre, ubicacion, supervisor, contraseña.
//    La contraseña se HASHEA con bcrypt; nunca se guarda/loguea en claro.
//  - Tiendas.csv (Latin-1/CP1252, punto y coma): num, nombre, lat, lng.
//    Catálogo GLOBAL de tiendas (la cercanía se resuelve en GET /api/stores).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

const promotersPath = process.env.SEED_CSV_PATH
  ? process.env.SEED_CSV_PATH
  : fileURLToPath(new URL("../../Promotores.csv", import.meta.url));
const storesPath = process.env.SEED_STORES_CSV_PATH
  ? process.env.SEED_STORES_CSV_PATH
  : fileURLToPath(new URL("../../Tiendas.csv", import.meta.url));

function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos combinados
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// --- Promotores (UTF-8, separado por comas) --------------------------------
function parsePromoters(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split(",").map((c) => c.trim());
    const [id, name, location, supervisor, password] = cols;
    if (!id || !/^\d+$/.test(id)) continue; // salta encabezado / filas inválidas
    if (!name || !password) continue;
    rows.push({ id, name, location, supervisor, password });
  }
  return rows;
}

// --- Tiendas (Latin-1, separado por ';') -----------------------------------
function parseStores(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split(";").map((c) => c.trim());
    // Formato: ["", num, nombre, lat, lng, "", "", ""]
    const num = cols[1];
    const name = cols[2];
    const lat = parseFloat(cols[3]);
    const lng = parseFloat(cols[4]);
    if (!name || name.toLowerCase() === "tienda") continue; // encabezado
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = num && /\w/.test(num) ? num : slugify(name);
    rows.push({ id, name, address: num ? `Tienda #${num}` : name, lat, lng });
  }
  return rows;
}

async function main() {
  // Optimización para la nube: si ya hay datos y no se fuerza, no re-sembramos
  // (evita re-hashear bcrypt en cada arranque en frío / reinicio).
  const already = await prisma.promoter.count().catch(() => 0);
  if (already > 0 && process.env.SEED_FORCE !== "true") {
    console.log(`Seed omitido: ya hay ${already} promotores (usa SEED_FORCE=true para forzar).`);
    return;
  }

  // Promotores (tolerante a archivo ausente, p.ej. antes de subir el Secret File).
  const promoters = existsSync(promotersPath)
    ? parsePromoters(readFileSync(promotersPath, "utf8"))
    : [];
  if (!promoters.length) console.warn(`AVISO: no se encontró/leyó ${promotersPath} — 0 promotores sembrados.`);
  const seen = new Set();
  const dupPromoters = [];
  let promoterCount = 0;
  for (const r of promoters) {
    if (seen.has(r.id)) {
      dupPromoters.push(r.id);
      continue;
    }
    seen.add(r.id);
    const passwordHash = await bcrypt.hash(r.password, BCRYPT_ROUNDS);
    await prisma.promoter.upsert({
      where: { id: r.id },
      update: { name: r.name, location: r.location, supervisor: r.supervisor, password: passwordHash },
      create: { id: r.id, name: r.name, location: r.location, supervisor: r.supervisor, password: passwordHash },
    });
    promoterCount++;
  }

  // Tiendas (catálogo global). Tolerante a archivo ausente.
  const stores = existsSync(storesPath) ? parseStores(readFileSync(storesPath, "latin1")) : [];
  if (!stores.length) console.warn(`AVISO: no se encontró/leyó ${storesPath} — 0 tiendas sembradas.`);
  const seenStores = new Set();
  const dupStores = [];
  let storeCount = 0;
  for (const s of stores) {
    if (seenStores.has(s.id)) {
      dupStores.push(s.id);
      continue;
    }
    seenStores.add(s.id);
    await prisma.store.upsert({ where: { id: s.id }, update: s, create: s });
    storeCount++;
  }

  console.log(
    `Seed OK: ${promoterCount} promotores (bcrypt), ${storeCount} tiendas en el catálogo global.`
  );
  if (dupPromoters.length)
    console.warn(`AVISO: IDs de promotor duplicados (se conservó el primero): ${[...new Set(dupPromoters)].join(", ")}`);
  if (dupStores.length)
    console.warn(`AVISO: números de tienda duplicados (se conservó el primero): ${[...new Set(dupStores)].join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
