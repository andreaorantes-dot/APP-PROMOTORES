// ---------------------------------------------------------------------------
// Campana de notificaciones — admin/gerente y supervisor.
// ---------------------------------------------------------------------------
// Pide GET /api/notifications al montar y cada 30s (centro de notificaciones
// "en la app": no hay push real al teléfono, ver decisión en el chat). Muestra
// un punto rojo cuando hay algo nuevo desde la última vez que se abrió.
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, TrendingUp, LogIn, Trophy, Store as StoreIcon, Mail } from "lucide-react";
import { api } from "./lib/api.js";
import { COLORS } from "./theme.js";
import { fmtMoney, fmtNum } from "./dashboardShared.jsx";

const POLL_MS = 30000;

function iconFor(tipo) {
  if (tipo === "checkin") return LogIn;
  if (tipo === "promoter_goal") return Trophy;
  if (tipo === "store_goal") return StoreIcon;
  if (tipo === "weekly_report") return Mail;
  return Bell;
}

function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], insight: null });
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications();
      setData(res);
    } catch {
      // Silencioso: la campana no debe mostrar errores encima del tablero.
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unseenCount = data.notifications.filter((n) => new Date(n.fecha).getTime() > seenAt).length;

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next) setSeenAt(Date.now());
      return next;
    });
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={toggle}
        title="Notificaciones"
        style={{ position: "relative", width: 36, height: 36, borderRadius: 9, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, color: COLORS.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Bell size={16} />
        {unseenCount > 0 && (
          <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 999, background: COLORS.danger, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: 44, right: 0, width: 320, maxHeight: 420, overflowY: "auto", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.28)", zIndex: 900 }}>
          {data.insight && (
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.accentSoft }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: COLORS.accentText, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                <TrendingUp size={13} /> {data.insight.label}
              </div>
              {data.insight.top.length === 0 ? (
                <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0 }}>Aún no hay ventas hoy.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {data.insight.top.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>{i + 1}. {p.name}</span>
                      <span style={{ fontWeight: 700, color: COLORS.text, fontFamily: "JetBrains Mono" }}>{p.money > 0 ? fmtMoney(p.money) : `${fmtNum(p.units)} u.`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {data.notifications.length === 0 ? (
            <p style={{ fontSize: 12.5, color: COLORS.textMuted, padding: "20px 14px", textAlign: "center", margin: 0 }}>Sin notificaciones todavía.</p>
          ) : (
            data.notifications.map((n, i) => {
              const Icon = iconFor(n.tipo);
              return (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 14px", borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <Icon size={13} color={COLORS.accentText} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, color: COLORS.text, margin: 0, lineHeight: 1.4 }}>{n.detalle}</p>
                    <span style={{ fontSize: 10.5, color: COLORS.textMuted }}>{timeAgo(n.fecha)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
