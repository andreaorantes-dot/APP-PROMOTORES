// ---------------------------------------------------------------------------
// Tiendas cercanas — GET /api/stores?lat=&lng=
// ---------------------------------------------------------------------------
// El frontend envía su ubicación GPS real. El SERVIDOR calcula la distancia
// (Haversine) desde cada tienda del catálogo global y devuelve solo las que
// están dentro de `nearbyRadiusMeters` (2 km por defecto), ordenadas por
// cercanía. No hay asignación fija de tiendas por promotor.
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";
import { distanceMeters, isValidCoords } from "../geo.js";
import { getAllStores } from "../db.js";

const router = Router();
router.use(requireAuth);

// GET /api/stores?lat=..&lng=..[&radius=..]
router.get("/", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!isValidCoords({ lat, lng })) {
    return res.status(400).json({ message: "Se requieren coordenadas GPS válidas (lat, lng)" });
  }
  // Radio opcional acotado al máximo del servidor (evita que el cliente lo infle).
  const requested = Number(req.query.radius);
  const radius = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 0), config.nearbyRadiusMeters)
    : config.nearbyRadiusMeters;

  const stores = await getAllStores();
  const nearby = stores
    .map((s) => ({ ...s, distance: Math.round(distanceMeters(lat, lng, s.lat, s.lng)) }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  return res.json({ radius, stores: nearby });
});

export default router;
