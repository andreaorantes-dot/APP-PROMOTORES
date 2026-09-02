// ---------------------------------------------------------------------------
// Perfil de un promotor (modal) — historial de check-in/check-out, su
// supervisor y las tiendas a las que suele ir. Se abre al hacer clic en un
// promotor desde el tablero del gerente o del supervisor (este último solo
// puede abrir a los suyos; el servidor lo valida).
//
// El historial vive detrás de un menú ("Historial de check-in/check-out ->")
// que abre una pantalla de detalle aparte, agrupada por día. Cada visita tiene
// un ícono de alerta para reportar un comportamiento extraño puntual — el
// reporte se guarda con el MISMO formato que la retroalimentación de los
// promotores (ver report-behavior en routes/promoterProfile.js).
import { useState, useEffect } from "react";
import { X, User, MapPin, Store, Clock, ChevronRight, ArrowLeft, AlertTriangle, Send, Camera, ZoomIn } from "lucide-react";
import { api, ApiError } from "./lib/api.js";
import { COLORS } from "./theme.js";
import { fmtNum, fmtDateTime } from "./dashboardShared.jsx";

function fmtDayHeader(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  if (!y || !m || !d) return day || "Sin fecha";
  const date = new Date(y, m - 1, d);
  const label = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function groupByDay(history) {
  const map = new Map();
  for (const v of history) {
    const key = v.day || "Sin fecha";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v);
  }
  return [...map.entries()];
}

// Fila de una visita dentro del historial, con el botón de reportar
// comportamiento extraño (se expande hacia un mini-formulario inline).
function VisitRow({ v, promoterId, reportKey, reporting, onToggleReport, onSent }) {
  const isOpen = reporting.openKey === reportKey;
  const sent = reporting.sentKeys.has(reportKey);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (sending || !text.trim()) return;
    setSending(true);
    setErr("");
    try {
      await api.reportBehavior(promoterId, { day: v.day, storeName: v.storeName, descripcion: text.trim() });
      onSent(reportKey);
      setText("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo guardar el reporte.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: COLORS.surface2, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.storeName}</div>
          <div style={{ color: COLORS.textMuted, marginTop: 1 }}>
            <MapPin size={10} style={{ verticalAlign: "-1px" }} /> Entró {fmtDateTime(v.checkInTime) || "--"} · Salió {fmtDateTime(v.checkOutTime) || "--"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right", color: COLORS.text, fontFamily: "JetBrains Mono", fontWeight: 700 }}>
            {fmtNum(v.rollos)}R · {fmtNum(v.cubetas)}C
          </div>
          <button
            onClick={() => onToggleReport(reportKey)}
            title="Reportar comportamiento extraño"
            style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: sent ? COLORS.success : isOpen ? COLORS.danger : COLORS.textMuted, display: "flex" }}
          >
            <AlertTriangle size={15} />
          </button>
        </div>
      </div>

      {sent && !isOpen && (
        <p style={{ fontSize: 11, color: COLORS.success, margin: "6px 0 0" }}>Reporte enviado.</p>
      )}

      {isOpen && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe lo que notaste (ej. checkout casi inmediato al check-in, sin ventas donde normalmente sí vende...)"
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontSize: 12.5, fontFamily: "Inter" }}
          />
          {err && <p style={{ color: COLORS.danger, fontSize: 11.5, margin: "4px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              onClick={() => onToggleReport(reportKey)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={sending || !text.trim()}
              style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "none", background: COLORS.danger, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: sending || !text.trim() ? "default" : "pointer", opacity: sending || !text.trim() ? 0.6 : 1 }}
            >
              <Send size={12} /> {sending ? "Enviando…" : "Enviar reporte"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PromoterProfile({ promoterId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("overview"); // "overview" | "history"
  const [openReportKey, setOpenReportKey] = useState(null);
  const [sentKeys, setSentKeys] = useState(new Set());
  const [zoomSrc, setZoomSrc] = useState(null);

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

  function toggleReport(key) {
    setOpenReportKey((cur) => (cur === key ? null : key));
  }
  function markSent(key) {
    setSentKeys((prev) => new Set(prev).add(key));
    setOpenReportKey(null);
  }

  const history = profile?.history ?? [];
  const grouped = groupByDay(history);

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
            {screen === "history" ? (
              <button onClick={() => setScreen("overview")} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}>
                <ArrowLeft size={18} />
              </button>
            ) : (
              <User size={16} color={COLORS.accentText} />
            )}
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
              {screen === "history" ? "Historial de check-in / check-out" : "Perfil del promotor"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && <p style={{ color: COLORS.textMuted, fontSize: 13 }}>Cargando…</p>}
          {error && <p style={{ color: COLORS.danger, fontSize: 13 }}>{error}</p>}

          {profile && screen === "overview" && (
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
                  <Camera size={13} /> Última foto de check-in
                </div>
                {profile.latestPhoto ? (
                  <button
                    onClick={() => setZoomSrc(profile.latestPhoto)}
                    style={{ position: "relative", width: 96, height: 96, borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.border}`, padding: 0, cursor: "pointer", background: COLORS.surface2 }}
                  >
                    <img src={profile.latestPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", opacity: 0, transition: "opacity .15s" }}>
                      <ZoomIn size={16} color="#fff" />
                    </span>
                  </button>
                ) : (
                  <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: 0 }}>Sin fotos de check-in registradas.</p>
                )}
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

              <button
                onClick={() => setScreen("history")}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}
              >
                <Clock size={15} color={COLORS.accentText} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: COLORS.text }}>Historial de check-in / check-out</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.accentText, background: COLORS.accentSoft, borderRadius: 999, padding: "2px 8px" }}>{history.length}</span>
                <ChevronRight size={15} color={COLORS.textMuted} />
              </button>
            </>
          )}

          {profile && screen === "history" && (
            history.length === 0 ? (
              <p style={{ fontSize: 12.5, color: COLORS.textMuted }}>Sin visitas registradas.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {grouped.map(([day, visits]) => (
                  <div key={day}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                      {fmtDayHeader(day)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {visits.map((v, i) => {
                        const key = `${day}-${v.storeId}-${i}`;
                        return (
                          <VisitRow
                            key={key}
                            v={v}
                            promoterId={promoterId}
                            reportKey={key}
                            reporting={{ openKey: openReportKey, sentKeys }}
                            onToggleReport={toggleReport}
                            onSent={markSent}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {zoomSrc && (
        <div
          onClick={(e) => { e.stopPropagation(); setZoomSrc(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}
        >
          <img src={zoomSrc} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
