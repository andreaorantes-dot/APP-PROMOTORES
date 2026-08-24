// ---------------------------------------------------------------------------
// Rutas del SUPERVISOR — igual que el resumen del gerente, pero acotado a SUS
// promotores (el ID de sesión del supervisor debe coincidir, en minúsculas,
// con el nombre en la columna SUPERVISOR de la pestaña Promotores).
// ---------------------------------------------------------------------------
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { getSupervisorSummary } from "../db.js";

const router = Router();
router.use(requireAuth, requireRole("supervisor"));

const RANGE_KEYS = ["today", "week", "month", "year"];

// GET /api/supervisor/summary?range=today|week|month|year
router.get("/summary", async (req, res) => {
  try {
    const range = RANGE_KEYS.includes(String(req.query.range)) ? String(req.query.range) : "today";
    const summary = await getSupervisorSummary(req.promoter.id, range);
    return res.json(summary);
  } catch (err) {
    console.error("[supervisor/summary]", err);
    return res.status(500).json({ message: "No se pudo generar el resumen" });
  }
});

export default router;
