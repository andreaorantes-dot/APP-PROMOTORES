// ---------------------------------------------------------------------------
// Perfil de un promotor: historial de check-in/check-out, su supervisor y las
// tiendas a las que suele ir. Lo puede ver: admin/gerente (cualquier
// promotor), un supervisor (SOLO los suyos) o el propio promotor (SOLO el
// suyo) — se valida abajo.
// ---------------------------------------------------------------------------
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { getPromoterProfile, promoterBelongsToSupervisor } from "../db.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "gerente", "supervisor", "promotor"));

// GET /api/promoters/:id/profile
router.get("/:id/profile", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.promoter;
    if (role === "promotor" && id !== req.promoter.id) {
      return res.status(403).json({ message: "Solo puedes ver tu propio perfil" });
    }
    if (role === "supervisor" && !(await promoterBelongsToSupervisor(id, req.promoter.id))) {
      return res.status(403).json({ message: "Ese promotor no está a tu cargo" });
    }
    const profile = await getPromoterProfile(id);
    if (!profile) return res.status(404).json({ message: "Promotor no encontrado" });
    return res.json(profile);
  } catch (err) {
    console.error("[promoters/:id/profile]", err);
    return res.status(500).json({ message: "No se pudo cargar el perfil" });
  }
});

export default router;
