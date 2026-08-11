import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { initDb } from "./prisma.js";
import { csrfProtection } from "./csrf.js";
import authRoutes from "./routes/auth.js";
import storeRoutes from "./routes/stores.js";
import visitRoutes from "./routes/visits.js";

// Robustez: un error no capturado en una petición NO debe tumbar el servidor
// (si se cae, TODOS los promotores pierden el servicio). Registramos y seguimos.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // detrás de un reverse proxy (HTTPS): IP/proto reales
// Límite amplio para la foto en Base64 (ya redimensionada en el cliente a
// ~100-200 KB). El tope solo protege de payloads anómalos.
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());

// CORS con credenciales (solo relevante si el frontend corre en otro origen).
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Cabeceras de seguridad básicas (equivalente mínimo a helmet).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// Protección CSRF explícita en toda petición que cambie estado (Protexa).
app.use(csrfProtection);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api", authRoutes); // expone /api/login, /api/auth/session, /api/auth/logout
app.use("/api/stores", storeRoutes); // GET /api/stores?lat&lng (tiendas cercanas)
app.use("/api/visits", visitRoutes);

// --- Servir el frontend estático (producción, mismo origen) ----------------
// Si existe el build del frontend (../../dist), lo servimos desde este mismo
// servidor. Ventajas: un solo origen (cookies/CSRF first-party sin proxy) y un
// único proceso detrás de HTTPS. Se activa con SERVE_STATIC=true o si el build
// existe. En dev (Vite en :5173) no aplica.
const distDir = fileURLToPath(new URL("../../dist/", import.meta.url));
const serveStatic = process.env.SERVE_STATIC === "true" || existsSync(distDir);
if (serveStatic && existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: cualquier ruta que no sea /api devuelve index.html.
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

// 404 (solo para /api si se sirve estático) y manejador de errores.
app.use((req, res) => res.status(404).json({ message: "No encontrado" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err);
  if (res.headersSent) return;
  res.status(err.status ?? 500).json({ message: "Error interno" });
});

initDb().finally(() => {
  app.listen(config.port, () => {
    console.log(
      `Backend Promotores en http://localhost:${config.port} (auth: ID + contraseña bcrypt${serveStatic ? "; sirviendo frontend estático" : ""})`
    );
  });
});
