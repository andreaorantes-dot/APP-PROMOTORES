// ---------------------------------------------------------------------------
// Rutas del GERENTE / ADMIN — resumen nacional del día.
// ---------------------------------------------------------------------------
// Todas exigen sesión válida (requireAuth) Y rol gerente o admin (requireRole).
// Un promotor de campo que intente llamarlas recibe 403.
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { getManagerSummary, setPromoterGoal } from "../db.js";

const router = Router();
router.use(requireAuth, requireRole("gerente", "admin"));

const RANGE_KEYS = ["today", "week", "month", "year"];

// GET /api/manager/summary?range=today|week|month|year
// Sin `range` (o uno inválido) usa "today". Devuelve totales, desglose por
// estado y el arreglo de promotores activos (con rollos, cubetas, dinero,
// ubicación y sus visitas individuales) para ese rango.
router.get("/summary", async (req, res) => {
  try {
    const range = RANGE_KEYS.includes(String(req.query.range)) ? String(req.query.range) : "today";
    const summary = await getManagerSummary(range);
    return res.json(summary);
  } catch (err) {
    console.error("[manager/summary]", err);
    return res.status(500).json({ message: "No se pudo generar el resumen" });
  }
});

// PUT /api/manager/promoter/:id/goal  { meta, nombre? }
// Fija la meta mensual (unidades) de un promotor. Solo admin/gerente pueden
// asignar metas (los supervisores solo las VEN en su tablero).
router.put("/promoter/:id/goal", async (req, res) => {
  try {
    const meta = Number(req.body?.meta);
    if (!Number.isFinite(meta) || meta <= 0) {
      return res.status(400).json({ message: "La meta debe ser un número mayor a 0" });
    }
    await setPromoterGoal(req.params.id, meta, req.body?.nombre);
    return res.status(204).end();
  } catch (err) {
    console.error("[manager/promoter/goal]", err);
    return res.status(500).json({ message: "No se pudo guardar la meta" });
  }
});

export default router;
