// ---------------------------------------------------------------------------
// Centro de notificaciones (campana) — admin/gerente y supervisor.
// ---------------------------------------------------------------------------
// Admin/gerente reciben las dirigidas a "admin" (check-in no aplica para
// ellos; sí "meta de tienda alcanzada") + un "insight" en vivo con el Top 5 de
// vendedores del día (no se guarda en el Sheet: se recalcula cada vez).
// Supervisor recibe las dirigidas a su propio ID (check-in de sus promotores
// y "meta de promotor alcanzada").
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { listNotificationsFor } from "../notificationsSheet.js";
import { getManagerSummary } from "../db.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "gerente", "supervisor"));

router.get("/", async (req, res) => {
  try {
    const role = req.promoter.role;
    const para = role === "supervisor" ? req.promoter.id : "admin";
    const notifications = await listNotificationsFor(para);

    let insight = null;
    if (role === "admin" || role === "gerente") {
      const today = await getManagerSummary("today");
      insight = {
        label: "Top 5 vendedores de hoy",
        top: today.promoters.slice(0, 5).map((p) => ({ id: p.id, name: p.name, money: p.money, units: p.rollos + p.cubetas })),
      };
    }

    return res.json({ notifications, insight });
  } catch (err) {
    console.error("[notifications]", err);
    return res.status(500).json({ message: "No se pudieron cargar las notificaciones" });
  }
});

export default router;
