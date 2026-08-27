// ---------------------------------------------------------------------------
// Agregación PURA del resumen del gerente (sin acceso a base de datos).
// ---------------------------------------------------------------------------
// Recibe las filas de VisitRecord de un rango de días (con `promoter` y
// `store` incluidos) y los precios, y devuelve el objeto que consume el
// tablero del gerente. Se mantiene separado de db.js (que hace la consulta
// Prisma) para poder probarlo de forma aislada. El `range` recibido ({from,to})
// solo se devuelve tal cual para que el frontend sepa qué período está viendo.
//
// Forma esperada de cada fila:
//   { promoterId, promoter:{name,supervisor}, storeId, store:{name,estado,lat,lng},
//     status, rollos, cubetas, day, checkInTime, checkOutTime }

export function summarizeVisitRows(rows, prices = {}, range) {
  const priceRollo = Number(prices.rollo || 0);
  const priceCubeta = Number(prices.cubeta || 0);
  const money = (rollos, cubetas) => rollos * priceRollo + cubetas * priceCubeta;

  const byPromoter = new Map();
  for (const r of rows) {
    const pid = r.promoterId;
    if (!byPromoter.has(pid)) {
      byPromoter.set(pid, {
        id: pid, name: r.promoter?.name || pid, supervisor: r.promoter?.supervisor || null,
        rollos: 0, cubetas: 0, galones: 0, visits: [], estados: new Set(),
        lastActivity: null, lastCheckInTime: null, lastCheckOutTime: null,
        openCount: 0, lat: null, lng: null, _lastTs: 0,
      });
    }
    const p = byPromoter.get(pid);
    const rollos = r.rollos || 0;
    const cubetas = r.cubetas || 0;
    const galones = r.galones || 0;
    p.rollos += rollos;
    p.cubetas += cubetas;
    p.galones += galones;
    if (r.status === "checked-in") p.openCount += 1;
    if (r.store?.estado) p.estados.add(r.store.estado);

    const inTs = r.checkInTime ? new Date(r.checkInTime).getTime() : 0;
    const outTs = r.checkOutTime ? new Date(r.checkOutTime).getTime() : 0;
    const lastTs = Math.max(inTs, outTs);
    if (lastTs >= p._lastTs) {
      p._lastTs = lastTs;
      p.lastActivity = r.checkOutTime || r.checkInTime || p.lastActivity;
      p.lastCheckInTime = r.checkInTime || null;
      p.lastCheckOutTime = r.checkOutTime || null;
      if (typeof r.store?.lat === "number" && typeof r.store?.lng === "number") {
        p.lat = r.store.lat;
        p.lng = r.store.lng;
      }
    }

    p.visits.push({
      day: r.day || null,
      storeId: r.storeId,
      storeName: r.store?.name || r.storeId,
      estado: r.store?.estado || null,
      lat: typeof r.store?.lat === "number" ? r.store.lat : null,
      lng: typeof r.store?.lng === "number" ? r.store.lng : null,
      status: r.status,
      rollos, cubetas, galones, money: money(rollos, cubetas),
      checkInTime: r.checkInTime, checkOutTime: r.checkOutTime,
    });
  }

  const promoters = [...byPromoter.values()].map((p) => {
    const estados = [...p.estados];
    return {
      id: p.id, name: p.name, supervisor: p.supervisor,
      estado: estados[0] || null,
      estados,
      rollos: p.rollos, cubetas: p.cubetas, galones: p.galones, money: money(p.rollos, p.cubetas),
      storesVisited: p.visits.length,
      status: p.openCount > 0 ? "in" : "done",
      lastActivity: p.lastActivity,
      checkInTime: p.lastCheckInTime, checkOutTime: p.lastCheckOutTime,
      lat: p.lat, lng: p.lng,
      visits: p.visits,
    };
  });

  promoters.sort((a, b) => b.money - a.money || (b.rollos + b.cubetas) - (a.rollos + a.cubetas));

  const estadoMap = new Map();
  for (const p of promoters) {
    const est = p.estado || "Sin estado";
    if (!estadoMap.has(est)) estadoMap.set(est, { estado: est, promoters: 0, rollos: 0, cubetas: 0, galones: 0, money: 0 });
    const e = estadoMap.get(est);
    e.promoters += 1;
    e.rollos += p.rollos;
    e.cubetas += p.cubetas;
    e.galones += p.galones;
    e.money += p.money;
  }
  const byEstado = [...estadoMap.values()].sort((a, b) => b.money - a.money);

  const totals = promoters.reduce(
    (a, p) => ({
      promoters: a.promoters + 1,
      storesVisited: a.storesVisited + p.storesVisited,
      rollos: a.rollos + p.rollos,
      cubetas: a.cubetas + p.cubetas,
      galones: a.galones + p.galones,
      money: a.money + p.money,
      checkedIn: a.checkedIn + (p.status === "in" ? 1 : 0),
      withoutSales: a.withoutSales + (p.rollos + p.cubetas + p.galones === 0 ? 1 : 0),
    }),
    { promoters: 0, storesVisited: 0, rollos: 0, cubetas: 0, galones: 0, money: 0, checkedIn: 0, withoutSales: 0 }
  );

  return { range, prices: { rollo: priceRollo, cubeta: priceCubeta }, totals, byEstado, promoters };
}
