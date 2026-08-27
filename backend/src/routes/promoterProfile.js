// ---------------------------------------------------------------------------
// Perfil de un promotor: historial de check-in/check-out, su supervisor y las
// tiendas a las que suele ir. Lo puede ver: admin/gerente (cualquier
// promotor), un supervisor (SOLO los suyos) o el propio promotor (SOLO el
// suyo) — se valida abajo.
// ---------------------------------------------------------------------------
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { getPromoterProfile, promoterBelongsToSupervisor, findPromoterById } from "../db.js";
import { appendFeedbackRow } from "../sheets.js";

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

// POST /api/promoters/:id/report-behavior  { day, storeName, descripcion }
// Alerta de "comportamiento extraño" que admin/gerente/supervisor levanta
// sobre una visita puntual del historial de un promotor. Se guarda en la
// MISMA pestaña y con el MISMO formato que la retroalimentación de los
// promotores (ver appendFeedbackRow en sheets.js) — solo cambia quién la
// envía. Un promotor no puede reportarse a sí mismo por esta vía (para eso
// ya existe su propio formulario de retroalimentación).
router.post("/:id/report-behavior", requireRole("admin", "gerente", "supervisor"), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.promoter;
    if (role === "supervisor" && !(await promoterBelongsToSupervisor(id, req.promoter.id))) {
      return res.status(403).json({ message: "Ese promotor no está a tu cargo" });
    }
    const descripcion = String(req.body?.descripcion || "").trim();
    if (!descripcion) return res.status(400).json({ message: "Describe el comportamiento a reportar" });
    const day = String(req.body?.day || "").trim();
    const storeName = String(req.body?.storeName || "").trim();

    const promoter = await findPromoterById(id);
    await appendFeedbackRow({
      idPromotor: id,
      nombre: promoter?.name || id,
      sucursal: [storeName, day].filter(Boolean).join(" — ") || "Sin especificar",
      descripcion,
      enviadoPor: req.promoter.id,
      ubicacion: "",
    });
    return res.status(204).end();
  } catch (err) {
    console.error("[promoters/:id/report-behavior]", err);
    return res.status(500).json({ message: err.message || "No se pudo guardar el reporte" });
  }
});

export default router;
