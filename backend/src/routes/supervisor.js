// ---------------------------------------------------------------------------
// Rutas del SUPERVISOR — igual que el resumen del gerente, pero acotado a SUS
// promotores (el ID de sesión del supervisor debe coincidir, en minúsculas,
// con el nombre en la columna SUPERVISOR de la pestaña Promotores).
// ---------------------------------------------------------------------------
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { getSupervisorSummary, getCompetitionReports } from "../db.js";

const router = Router();
router.use(requireAuth, requireRole("supervisor"));

const RANGE_KEYS = ["today", "yesterday", "week", "last_week", "month", "last_month", "year", "last_year"];

// GET /api/supervisor/summary?range=today|yesterday|week|last_week|month|last_month|year|last_year
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

// GET /api/supervisor/competencia — reportes de Competencia, acotados a SU equipo.
router.get("/competencia", async (req, res) => {
  try {
    const reports = await getCompetitionReports({ supervisorId: req.promoter.id });
    return res.json({ reports });
  } catch (err) {
    console.error("[supervisor/competencia]", err);
    return res.status(500).json({ message: "No se pudieron cargar los reportes de competencia" });
  }
});

export default router;
