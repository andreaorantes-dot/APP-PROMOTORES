import { Router } from "express";
import { authenticate, issueSession, clearSession, requireAuth } from "../auth.js";
import { findPromoterById } from "../db.js";

const router = Router();

// POST /api/login  { promoterId, password }
// Verifica ID + contraseña (bcrypt) y emite la cookie de sesión HttpOnly.
router.post("/login", async (req, res) => {
  const { promoterId, password } = req.body ?? {};
  try {
    const promoter = await authenticate(promoterId, password);
    issueSession(res, promoter);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status ?? 401).json({ message: err.message ?? "No autorizado" });
  }
});

// GET /api/auth/session -> { id, name, location, supervisor }
// Las tiendas ya NO vienen aquí: se obtienen por cercanía en GET /api/stores.
router.get("/auth/session", requireAuth, async (req, res) => {
  const promoter = await findPromoterById(req.promoter.id);
  if (!promoter) return res.status(401).json({ message: "Sesión inválida" });
  return res.json({
    id: promoter.id,
    name: promoter.name,
    location: promoter.location,
    supervisor: promoter.supervisor,
  });
});

// POST /api/auth/logout
router.post("/auth/logout", requireAuth, (req, res) => {
  clearSession(res);
  return res.status(204).end();
});

export default router;
