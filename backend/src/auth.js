// ---------------------------------------------------------------------------
// Autenticación: ID de promotor + contraseña (bcrypt) + sesión en cookie HttpOnly.
// ---------------------------------------------------------------------------
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { findPromoterById } from "./db.js";
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from "./csrf.js";

// ---------------------------------------------------------------------------
// Verifica ID + contraseña contra el hash bcrypt almacenado. Devuelve el
// promotor (sin el hash) o lanza un error 401 genérico (no revela si falló el
// ID o la contraseña, para no filtrar qué IDs existen).
// ---------------------------------------------------------------------------
export async function authenticate(promoterId, password) {
  const unauthorized = () => {
    const e = new Error("ID o contraseña incorrectos");
    e.status = 401;
    return e;
  };

  if (!promoterId || !password) throw unauthorized();

  const promoter = await findPromoterById(String(promoterId).trim());
  if (!promoter) {
    // Comparación "dummy" para igualar el tiempo de respuesta y mitigar
    // ataques de enumeración por temporización.
    await bcrypt.compare(password, "$2a$10$abcdefghijklmnopqrstuv");
    throw unauthorized();
  }

  const ok = await bcrypt.compare(password, promoter.password);
  if (!ok) throw unauthorized();

  return { id: promoter.id, name: promoter.name, location: promoter.location, supervisor: promoter.supervisor };
}

// ---------------------------------------------------------------------------
// Sesión: JWT propio firmado, transportado SIEMPRE en cookie HttpOnly, con
// token CSRF ligado (double-submit).
// ---------------------------------------------------------------------------
export function issueSession(res, promoter) {
  const csrfToken = generateCsrfToken();

  const token = jwt.sign(
    { sub: promoter.id, name: promoter.name, csrf: csrfToken },
    config.session.secret,
    { expiresIn: config.session.ttlSeconds }
  );

  res.cookie(config.session.cookieName, token, {
    httpOnly: true, // invisible a JavaScript → protege de XSS
    secure: config.session.cookieSecure, // solo HTTPS en producción
    sameSite: "strict", // mitiga CSRF (defensa en profundidad junto al token)
    maxAge: config.session.ttlSeconds * 1000,
    path: "/",
  });

  setCsrfCookie(res, csrfToken);
}

export function clearSession(res) {
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: "strict",
    path: "/",
  });
  clearCsrfCookie(res);
}

// Middleware: exige una cookie de sesión válida. Deja req.promoter listo.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[config.session.cookieName];
  if (!token) return res.status(401).json({ message: "No autenticado" });
  try {
    const claims = jwt.verify(token, config.session.secret);
    req.promoter = { id: claims.sub, name: claims.name };
    next();
  } catch {
    clearSession(res);
    return res.status(401).json({ message: "Sesión inválida o expirada" });
  }
}
