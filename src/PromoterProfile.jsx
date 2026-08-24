// ---------------------------------------------------------------------------
// Perfil de un promotor (modal) — historial de check-in/check-out, su
// supervisor y las tiendas a las que suele ir. Se abre al hacer clic en un
// promotor desde el tablero del gerente o del supervisor (este último solo
// puede abrir a los suyos; el servidor lo valida).
import { useState, useEffect } from "react";
import { X, User, MapPin, Store, Clock } from "lucide-react";
import { api, ApiError } from "./lib/api.js";
import { COLORS } from "./theme.js";
import { fmtNum, fmtDateTime } from "./dashboardShared.jsx";

export default function PromoterProfile({ promoterId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .promoterProfile(promoterId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "No se pudo cargar el perfil."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [promoterId]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.surface, borderRadius: 16, width: "min(480px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <User size={16} color={COLORS.accentText} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Perfil del promotor</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && <p style={{ color: COLORS.textMuted, fontSize: 13 }}>Cargando…</p>}
          {error && <p style={{ color: COLORS.danger, fontSize: 13 }}>{error}</p>}

          {profile && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{profile.name}</div>
                <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 }}>ID {profile.id}{profile.location ? ` · ${profile.location}` : ""}</div>
                <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 }}>
                  Supervisor: <b style={{ color: COLORS.text }}>{profile.supervisor || "Sin asignar"}</b>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  <Store size={13} /> Tiendas frecuentes
                </div>
                {profile.frequentStores.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: COLORS.textMuted }}>Sin visitas registradas.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {profile.frequentStores.map((s) => (
                      <span key={s.storeId} style={{ fontSize: 12, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: "5px 10px", color: COLORS.text }}>
                        {s.storeName} <b>·{fmtNum(s.visits)}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  <Clock size={13} /> Historial de check-in / check-out
                </div>
                {profile.history.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: COLORS.textMuted }}>Sin visitas registradas.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {profile.history.map((v, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, background: COLORS.surface2, borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.storeName}</div>
                          <div style={{ color: COLORS.textMuted, marginTop: 1 }}>
                            <MapPin size={10} style={{ verticalAlign: "-1px" }} /> Entró {fmtDateTime(v.checkInTime) || "--"} · Salió {fmtDateTime(v.checkOutTime) || "--"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, color: COLORS.text, fontFamily: "JetBrains Mono", fontWeight: 700 }}>
                          {fmtNum(v.rollos)}R · {fmtNum(v.cubetas)}C
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
