// ---------------------------------------------------------------------------
// Panel de revisión de reportes de Competencia (modal) — admin/gerente ve
// todos, supervisor solo los de su equipo. `fetcher` es la función de api.js
// a usar (managerCompetencia | supervisorCompetencia) para no duplicar este
// componente por rol.
import { useState, useEffect } from "react";
import { X, Flag, User, ZoomIn } from "lucide-react";
import { ApiError } from "./lib/api.js";
import { COLORS } from "./theme.js";
import { fmtDateTime } from "./dashboardShared.jsx";

export default function CompetenciaPanel({ fetcher, onClose }) {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [zoomSrc, setZoomSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((res) => { if (!cancelled) setReports(res.reports ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "No se pudieron cargar los reportes."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetcher]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.surface, borderRadius: 16, width: "min(520px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Flag size={16} color={COLORS.accentText} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Competencia</span>
            {!loading && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.accentText, background: COLORS.accentSoft, borderRadius: 999, padding: "2px 8px" }}>{reports.length}</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && <p style={{ color: COLORS.textMuted, fontSize: 13 }}>Cargando…</p>}
          {error && <p style={{ color: COLORS.danger, fontSize: 13 }}>{error}</p>}

          {!loading && !error && reports.length === 0 && (
            <div style={{ textAlign: "center", padding: "28px 12px", color: COLORS.textMuted }}>
              <Flag size={26} style={{ opacity: 0.5 }} />
              <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>Aún no hay reportes de competencia.</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reports.map((r) => (
              <div key={r.id} style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <User size={12} color={COLORS.textMuted} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.promoterName}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: COLORS.textMuted, flexShrink: 0 }}>{fmtDateTime(r.createdAt)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accentText, background: COLORS.accentSoft, borderRadius: 999, padding: "2px 9px" }}>{r.marca}</span>
                </div>
                <p style={{ fontSize: 12.5, color: COLORS.text, margin: "0 0 8px", lineHeight: 1.45 }}>{r.descripcion}</p>
                {r.photos?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.photos.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setZoomSrc(src)}
                        style={{ position: "relative", width: 56, height: 56, borderRadius: 8, overflow: "hidden", border: `1px solid ${COLORS.border}`, padding: 0, cursor: "pointer", background: COLORS.surface }}
                      >
                        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", opacity: 0, transition: "opacity .15s" }}>
                          <ZoomIn size={14} color="#fff" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
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
