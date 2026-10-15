// ---------------------------------------------------------------------------
// Cámara integrada de la app.
// ---------------------------------------------------------------------------
// Abre la cámara trasera con getUserMedia y captura el cuadro directamente a
// un tamaño ya reducido (según el diagnóstico del dispositivo), sin salir a la
// app de cámara del sistema. Así nunca existe la foto a resolución completa en
// memoria: en teléfonos de gama baja eso es lo que cerraba o recargaba la app.
//
// Si el navegador no soporta la cámara integrada, el promotor niega el
// permiso o la cámara no abre, se ofrece "Usar la cámara del teléfono"
// (onUnavailable), que es el selector de archivos de siempre: nadie se queda
// sin poder registrar su visita.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera, RefreshCw, AlertTriangle } from "lucide-react";
import { COLORS } from "./theme.js";
import { drawResized } from "./lib/imageTools.js";
import { classify, readSnapshot, recommend, recordPhotoMetric, TIER_LABEL } from "./lib/deviceProfile.js";

export function cameraSupported() {
  return typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && (typeof window === "undefined" || window.isSecureContext !== false);
}

function stopStream(stream) {
  if (stream) for (const t of stream.getTracks()) t.stop();
}

// Props:
//   kind          "visit" | "competition" (define tamaño y calidad recomendados)
//   onCapture     (dataUrl) => void, se llama con cada foto tomada
//   onClose       () => void, el promotor cierra la cámara
//   onUnavailable () => void, pide usar el selector de archivos del sistema
//   multi/max/count  varias fotos seguidas (Competencia): se muestra "n/max" y "Listo"
export default function CameraCapture({ kind = "visit", onCapture, onClose, onUnavailable, multi = false, max = 1, count = 0 }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState("starting"); // starting | ready | paused | error
  const [errorMsg, setErrorMsg] = useState("");
  const [shots, setShots] = useState(0);
  const baseCount = useRef(count); // fotos que ya había al abrir; `count` del padre crece con cada foto
  const rec = useMemo(() => recommend(classify(readSnapshot()), kind), [kind]);

  const start = useCallback(async () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setState("starting");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: rec.video.width },
          height: { ideal: rec.video.height },
          frameRate: { ideal: rec.video.frameRate, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopStream(stream); return; } // se cerró mientras pedía permiso
      video.srcObject = stream;
      await video.play().catch(() => {});
      setState("ready");
    } catch (err) {
      const name = err?.name || "";
      setState("error");
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMsg("No diste permiso para usar la cámara. Actívalo en el navegador o usa la cámara del teléfono.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErrorMsg("No se encontró una cámara disponible. Usa la cámara del teléfono.");
      } else {
        setErrorMsg("La cámara no pudo abrirse (puede estar en uso por otra app). Usa la cámara del teléfono.");
      }
    }
  }, [rec]);

  // Abre la cámara al montar y la libera siempre al desmontar.
  useEffect(() => {
    start();
    return () => { stopStream(streamRef.current); streamRef.current = null; };
  }, [start]);

  // Si la app pasa a segundo plano se suelta la cámara (ahorra batería y
  // memoria; algunos teléfonos la matan de todos modos).
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        stopStream(streamRef.current);
        streamRef.current = null;
        setState((s) => (s === "ready" ? "paused" : s));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function shoot() {
    const video = videoRef.current;
    if (state !== "ready" || !video || !video.videoWidth) return;
    const t0 = performance.now();
    try {
      const dataUrl = drawResized(video, rec.maxDim, rec.quality);
      recordPhotoMetric({
        kind,
        via: "camera",
        ok: true,
        ms: Math.round(performance.now() - t0),
        bytes: Math.round(dataUrl.length * 0.75),
        w: video.videoWidth,
        h: video.videoHeight,
      });
      onCapture(dataUrl);
      const total = shots + 1;
      setShots(total);
      if (!multi || baseCount.current + total >= max) {
        stopStream(streamRef.current);
        streamRef.current = null;
        onClose();
      }
    } catch (err) {
      recordPhotoMetric({ kind, via: "camera", ok: false, ms: Math.round(performance.now() - t0), error: err?.message });
      setErrorMsg("No se pudo capturar la foto. Intenta de nuevo.");
    }
  }

  const overlay = {
    position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", flexDirection: "column",
    paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
  };
  const showVideo = state === "ready" || state === "starting";

  return createPortal(
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Cámara">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", color: "#fff" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {multi ? `Foto ${Math.min(baseCount.current + shots + 1, max)} de ${max}` : "Tomar foto"}
          <span style={{ fontWeight: 400, opacity: 0.65, marginLeft: 8 }}>{TIER_LABEL[rec.tier]} · {rec.maxDim}px</span>
        </span>
        <button onClick={onClose} aria-label="Cerrar cámara" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: 0, background: "#000" }}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: showVideo ? "block" : "none" }}
        />
        {state === "starting" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13 }}>
            Abriendo cámara…
          </div>
        )}
        {state === "paused" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, padding: 24, textAlign: "center" }}>
            <span>Cámara en pausa.</span>
            <button onClick={start} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: COLORS.accent, color: "#1A1714", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <RefreshCw size={16} /> Reanudar
            </button>
          </div>
        )}
        {state === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", color: "#fff", padding: 24, textAlign: "center" }}>
            <AlertTriangle size={28} color={COLORS.accent} />
            <span style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 320 }}>{errorMsg}</span>
            <button onClick={onUnavailable} style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: COLORS.accent, color: "#1A1714", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <Camera size={16} /> Usar la cámara del teléfono
            </button>
            <button onClick={start} style={{ background: "transparent", border: "none", color: "#fff", opacity: 0.8, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}>
              Reintentar
            </button>
          </div>
        )}
        {state === "ready" && errorMsg && (
          <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, textAlign: "center" }}>
            {errorMsg}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "18px 0 22px", position: "relative", background: "#000" }}>
        <button
          onClick={shoot}
          disabled={state !== "ready"}
          aria-label="Tomar foto"
          style={{ width: 72, height: 72, borderRadius: "50%", border: "4px solid #fff", background: state === "ready" ? COLORS.accent : "#555", cursor: state === "ready" ? "pointer" : "default", boxShadow: "0 0 0 4px rgba(0,0,0,0.6) inset" }}
        />
        {multi && (
          <button onClick={onClose} style={{ position: "absolute", right: 18, padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
            Listo
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
