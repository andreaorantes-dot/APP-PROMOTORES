import { useState, useEffect, useRef, useCallback } from "react";
import { LogOut, MapPin, ArrowLeft, Check, Minus, Plus, Navigation, AlertTriangle, Clock, WifiOff, RefreshCw, Camera, User, Lock, MessageSquare, Send, X, Home, BarChart3, GraduationCap, LifeBuoy, ImagePlus, Trophy, Zap } from "lucide-react";
import { useAuth } from "./auth/AuthProvider.jsx";
import { api, ApiError } from "./lib/api.js";
import { RANGE_METERS } from "./config.js";
import {
  enqueueAction,
  listQueuedActions,
  removeQueuedAction,
  countQueued,
  cacheRecords,
  readCachedRecords,
} from "./lib/offlineStore.js";

// ---------------------------------------------------------------------------
// Paletas de marca Protexa (Manual 2026): Amarillo #F8C000, Negro #221F1C,
// Blanco #FFFFFF. Dos temas — OSCURO y CLARO — que la app hereda del
// dispositivo vía `prefers-color-scheme`.
//
// Tokens de contraste importantes:
//   - `accent`     = Amarillo Protexa, SOLO como FONDO de botones/acciones.
//   - `onAccent`   = texto/ícono SOBRE el amarillo (Negro Protexa).
//   - `accentText` = color del acento cuando se usa como TEXTO/ícono/borde.
//                    En oscuro es el amarillo; en claro se oscurece para no
//                    violar la regla de marca "nunca amarillo sobre blanco".
// ---------------------------------------------------------------------------
const PALETTES = {
  dark: {
    bg: "#1A1714",
    surface: "#221F1C", // Negro Protexa
    surface2: "#2E2A25",
    border: "#3B352E",
    text: "#FFFFFF",
    textMuted: "#B6AE9F",
    accent: "#F8C000", // Amarillo Protexa
    accentSoft: "rgba(248,192,0,0.15)",
    accentText: "#F8C000", // legible sobre superficies oscuras
    onAccent: "#221F1C", // texto sobre botones amarillos
    success: "#2DD9A8",
    successSoft: "rgba(45,217,168,0.14)",
    onSuccess: "#05231B",
    danger: "#F2545B",
    dangerSoft: "rgba(242,84,91,0.14)",
  },
  light: {
    bg: "#FFFFFF",
    surface: "#FFFFFF",
    surface2: "#F4F2EE",
    border: "#E4DFD6",
    text: "#221F1C", // Negro Protexa
    textMuted: "#6E675E",
    accent: "#F8C000", // Amarillo Protexa (fondo de acciones)
    accentSoft: "rgba(248,192,0,0.20)",
    accentText: "#221F1C", // en claro el acento-texto es negro (regla: no amarillo sobre blanco)
    onAccent: "#221F1C", // texto sobre botones amarillos (negro, alto contraste)
    success: "#137A5B",
    successSoft: "rgba(19,122,91,0.12)",
    onSuccess: "#FFFFFF",
    danger: "#C0343E",
    dangerSoft: "rgba(192,52,62,0.10)",
  },
};

// Detecta el esquema del dispositivo (claro/oscuro). Por defecto: oscuro.
function detectScheme() {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

// Objeto de color VIVO: mantiene la MISMA referencia y se actualiza in-place al
// cambiar el tema, de modo que todos los estilos en línea (que leen COLORS.x en
// cada render) tomen los nuevos valores cuando el árbol se vuelve a renderizar.
const COLORS = { ...PALETTES[detectScheme()] };
function applyScheme(scheme) {
  Object.assign(COLORS, PALETTES[scheme] || PALETTES.dark);
}

// NOTE: PROMOTERS, GOOGLE_ACCOUNTS and GOOGLE_DOMAIN have been removed.
// Identity now comes from Google Workspace (OIDC) and the promoter's assigned
// stores are loaded from the backend via `useAuth().user` / the API — never
// hardcoded in the client bundle.

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtTime(iso) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(startIso, endIso) {
  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const mins = Math.max(0, Math.floor((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function fmtDistance(m) {
  if (m == null) return "--";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Mensaje claro para errores de geolocalización. El caso más común en móviles
// es no estar en un contexto seguro (HTTPS): los navegadores bloquean el GPS.
function gpsErrorMessage(err) {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "El GPS requiere conexión segura (HTTPS). Abre la app por https:// (o localhost).";
  }
  if (err && err.code === err.PERMISSION_DENIED) {
    return "Permiso de ubicación denegado. Actívalo en el navegador para continuar.";
  }
  if (err && err.code === err.TIMEOUT) {
    return "Tardó demasiado en obtener el GPS. Sal a cielo abierto e inténtalo de nuevo.";
  }
  return "No se pudo obtener tu ubicación GPS.";
}

// Redimensiona la imagen capturada a un máximo de `maxDim` px (lado mayor) y la
// devuelve como data URL JPEG. Reduce el peso antes de cifrarla/enviarla.
function resizeImage(file, maxDim = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen inválida"));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// La tipografía de marca es Helvetica (fuente de sistema); no se cargan fuentes
// web. Se conserva el hook como no-op para no tocar el resto del componente.
function useGoogleFonts() {}

function Stepper({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <span style={{ fontFamily: "Inter", fontSize: 15, color: COLORS.text }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, color: COLORS.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Minus size={16} />
        </button>
        <span style={{ fontFamily: "JetBrains Mono", fontSize: 18, fontWeight: 600, color: COLORS.text, minWidth: 28, textAlign: "center" }}>{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${COLORS.accent}`, background: COLORS.accentSoft, color: COLORS.accentText, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function Radar({ distance, inRange, gpsError, hasFix }) {
  // Sin fix GPS todavía (o error): estado neutro/alerta, no "fuera de rango".
  const waiting = !hasFix;
  const statusColor = gpsError ? COLORS.danger : inRange ? COLORS.success : waiting ? COLORS.textMuted : COLORS.accentText;
  const label = gpsError ? "SIN UBICACIÓN" : waiting ? "BUSCANDO GPS…" : inRange ? "DENTRO DEL RANGO" : "FUERA DE RANGO";
  return (
    <div style={{ position: "relative", width: 220, height: 220, margin: "0 auto" }}>
      <style>{`
        @keyframes radarPulse {
          0% { transform: scale(0.4); opacity: 0.55; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        .radar-pulse { animation: radarPulse 2.2s ease-out infinite; transform-origin: center; }
      `}</style>
      <svg viewBox="0 0 220 220" style={{ width: "100%", height: "100%" }}>
        <circle cx="110" cy="110" r="100" fill="none" stroke={COLORS.border} strokeWidth="1" strokeDasharray="3 6" />
        <circle cx="110" cy="110" r="68" fill="none" stroke={COLORS.border} strokeWidth="1" strokeDasharray="3 6" />
        <circle cx="110" cy="110" r="36" fill="none" stroke={COLORS.border} strokeWidth="1" />
        {inRange && <circle className="radar-pulse" cx="110" cy="110" r="36" fill={statusColor} opacity="0.35" />}
        <circle cx="110" cy="110" r="26" fill={statusColor} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontFamily: "JetBrains Mono", fontSize: 22, fontWeight: 600, color: COLORS.text }}>{hasFix ? fmtDistance(distance) : "--"}</span>
        <span style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: "0.06em", color: statusColor, marginTop: 4, fontWeight: 600, textAlign: "center", padding: "0 10px" }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa (OpenStreetMap + Leaflet, cargado desde CDN — gratis, sin API key).
// Muestra la ubicación real del promotor y, opcionalmente, las tiendas cercanas.
// ---------------------------------------------------------------------------
function MapView({ coords, stores = [] }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const userRef = useRef(null);
  const [ready, setReady] = useState(typeof window !== "undefined" && !!window.L);
  const [failed, setFailed] = useState(false); // no se pudo cargar Leaflet (p.ej. red bloqueada)

  // Carga Leaflet (CSS + JS) desde CDN una sola vez.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) { setReady(true); return; }
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    let s = document.getElementById("leaflet-js");
    if (!s) {
      s = document.createElement("script");
      s.id = "leaflet-js";
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.async = true;
      document.body.appendChild(s);
    }
    s.addEventListener("load", () => setReady(true));
    s.addEventListener("error", () => setFailed(true));
    // Si en 8s no cargó Leaflet (red corporativa bloqueando el CDN), marca fallo.
    const t = setTimeout(() => { if (!window.L) setFailed(true); }, 8000);
    return () => clearTimeout(t);
  }, []);

  // Limpieza al desmontar.
  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  // Inicializa / actualiza el mapa cuando hay coordenadas.
  useEffect(() => {
    const L = window.L;
    if (!ready || !L || !coords || !elRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(elRef.current, { zoomControl: false, attributionControl: true }).setView([coords.lat, coords.lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapRef.current);
      const icon = L.divIcon({
        className: "",
        html: `<div style="color:${COLORS.accent};filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      userRef.current = L.marker([coords.lat, coords.lng], { icon }).addTo(mapRef.current);
    } else {
      mapRef.current.setView([coords.lat, coords.lng]);
      userRef.current.setLatLng([coords.lat, coords.lng]);
    }
    setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 150);
  }, [ready, coords]);

  // Marcadores de las tiendas cercanas.
  useEffect(() => {
    const L = window.L;
    if (!ready || !L || !mapRef.current) return;
    mapRef.current.__stores = mapRef.current.__stores || L.layerGroup().addTo(mapRef.current);
    const layer = mapRef.current.__stores;
    layer.clearLayers();
    // Todas las tiendas del catálogo son Home Depot: marcador de círculo naranja
    // (#F96302) con ícono de casa. El tooltip muestra "Nombre - Número".
    const hdHtml = `<div style="width:26px;height:26px;border-radius:50%;background:#F96302;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.8V20h14V9.8"/></svg></div>`;
    for (const s of stores) {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
      const icon = L.divIcon({ className: "", html: hdHtml, iconSize: [26, 26], iconAnchor: [13, 13] });
      const label = s.id ? `${s.name} - ${s.id}` : s.name;
      L.marker([s.lat, s.lng], { icon }).bindTooltip(label, { direction: "top" }).addTo(layer);
    }
  }, [ready, stores]);

  // Fallback si el mapa no cargó (p.ej. la red bloquea unpkg/OpenStreetMap):
  // muestra las coordenadas en texto en lugar de un recuadro vacío.
  if (failed) {
    return (
      <div style={{ marginBottom: 14, height: 160, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, textAlign: "center" }}>
        <MapPin size={22} color={COLORS.accentText} />
        <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "JetBrains Mono" }}>
          {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "Ubicación no disponible"}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>
          El mapa no cargó en esta red. Se verá al desplegar o con otra conexión.
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <div ref={elRef} style={{ height: 160, borderRadius: 14, overflow: "hidden", border: `1px solid ${COLORS.border}`, background: COLORS.surface2 }} />
      {!coords && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted, fontSize: 12.5, pointerEvents: "none" }}>
          Obteniendo tu ubicación…
        </div>
      )}
    </div>
  );
}

// META de ventas (placeholder; conectar a una pestaña "Metas" del Sheet).
const SALES_GOALS = { rollos: 500, cubetas: 200 };

function GoalBar({ label, actual, meta }) {
  const pct = Math.min(100, Math.round((actual / meta) * 100) || 0);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: COLORS.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>{actual} / {meta} · <b style={{ color: COLORS.accentText }}>{pct}%</b></span>
      </div>
      <div style={{ height: 12, borderRadius: 999, background: COLORS.surface2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${COLORS.accent}, #ffd84d)`, transition: "width .4s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {[25, 50, 75, 100].map((m) => (
          <span key={m} style={{ fontSize: 8.5, fontWeight: 600, color: pct >= m ? COLORS.accentText : COLORS.textMuted }}>{m === 100 ? "Meta" : `${m}%`}</span>
        ))}
      </div>
    </div>
  );
}

// Barra de meta de ventas con gamificación (nivel + mensaje motivacional).
// `actual` se suma de las visitas del día; la META es placeholder por ahora.
function SalesGoals({ records }) {
  const sums = Object.values(records || {}).reduce(
    (a, r) => ({ rollos: a.rollos + (r.rollos || 0), cubetas: a.cubetas + (r.cubetas || 0) }),
    { rollos: 0, cubetas: 0 }
  );
  const rPct = Math.min(100, (sums.rollos / SALES_GOALS.rollos) * 100 || 0);
  const cPct = Math.min(100, (sums.cubetas / SALES_GOALS.cubetas) * 100 || 0);
  const overall = Math.round((rPct + cPct) / 2);
  const level = overall >= 75 ? "Nivel Oro" : overall >= 40 ? "Nivel Plata" : "Nivel Bronce";
  const faltanR = Math.max(0, SALES_GOALS.rollos - sums.rollos);
  const faltanC = Math.max(0, SALES_GOALS.cubetas - sums.cubetas);
  const msg =
    overall >= 100 ? "¡Meta cumplida! Excelente trabajo."
    : overall >= 75 ? `¡Casi lo logras! Te faltan ${faltanR} rollos y ${faltanC} cubetas.`
    : overall >= 40 ? `¡Vas muy bien! Te faltan ${faltanR} rollos y ${faltanC} cubetas para tu meta.`
    : "¡Vamos con todo! Cada visita te acerca a tu meta.";
  return (
    <>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.1em", color: COLORS.textMuted, fontWeight: 600 }}>META DE VENTAS</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, background: COLORS.accentSoft, color: COLORS.accentText, fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999 }}>
            <Trophy size={12} /> {level}
          </span>
        </div>
        <GoalBar label="Rollos" actual={sums.rollos} meta={SALES_GOALS.rollos} />
        <GoalBar label="Cubetas" actual={sums.cubetas} meta={SALES_GOALS.cubetas} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: COLORS.successSoft, border: `1px solid ${COLORS.success}55`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
        <Zap size={16} color={COLORS.success} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.45 }}>{msg}</span>
      </div>
    </>
  );
}

export default function PromotoresApp() {
  useGoogleFonts();

  // Tema claro/oscuro heredado del dispositivo (prefers-color-scheme). Al
  // cambiar el esquema del sistema, se actualiza la paleta VIVA (in-place) y se
  // fuerza un re-render para que toda la UI adopte el nuevo tema al instante.
  const [scheme, setScheme] = useState(detectScheme());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e) => {
      const s = e.matches ? "light" : "dark";
      applyScheme(s);
      setScheme(s);
    };
    applyScheme(scheme); // asegura sincronía inicial
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange); // Safari antiguo
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { status, user, error: authError, login, logout } = useAuth();

  const [screen, setScreen] = useState("dashboard");
  const [records, setRecords] = useState({});
  const [selectedStore, setSelectedStore] = useState(null);
  const [busy, setBusy] = useState(false);

  // Tiendas cercanas (por GPS). No hay asignación fija por promotor.
  const [nearbyStores, setNearbyStores] = useState([]);
  const [allStores, setAllStores] = useState([]); // catálogo completo (para el mapa)
  const [nearbyRadius, setNearbyRadius] = useState(2000); // m; lo confirma el server
  const [dashCoords, setDashCoords] = useState(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState(null);

  // Formulario de login (ID de promotor + contraseña).
  const [promoterId, setPromoterId] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false); // modal de retroalimentación

  // Formulario de Competencia (interfaz; la persistencia se conecta después).
  const [compMarca, setCompMarca] = useState("");
  const [compDesc, setCompDesc] = useState("");
  const [compFotos, setCompFotos] = useState([]); // data URLs (previsualización)
  const [compSent, setCompSent] = useState(false);
  const compFileRef = useRef(null);
  const [rollos, setRollos] = useState(0);
  const [cubetas, setCubetas] = useState(0);
  const [photo, setPhoto] = useState(null); // foto de check-in (Base64), obligatoria
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef(null);
  const watchIdRef = useRef(null);

  // Estado de conectividad y cola offline cifrada.
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const stores = nearbyStores;
  const store = selectedStore;
  const record = store ? records[store.id] : null;

  // Reenvía al backend las acciones que se encolaron (cifradas) sin red.
  const flushQueue = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      const actions = await listQueuedActions();
      for (const a of actions) {
        try {
          if (a.type === "check-in") {
            await api.checkIn(a.storeId, a.payload); // { coords, photo }
          } else if (a.type === "check-out") {
            await api.checkOut(a.storeId, a.payload);
          }
          await removeQueuedAction(a.id); // solo se borra si el servidor la aceptó
        } catch (e) {
          // 4xx = el servidor la rechazó (p.ej. fuera de rango): descartar para
          // no reintentar en bucle. Error de red: se deja para el próximo flush.
          if (e instanceof ApiError) await removeQueuedAction(a.id);
          else break;
        }
      }
      // Refresca desde el servidor y actualiza la caché cifrada.
      try {
        const data = await api.visitsToday();
        setRecords(data?.records ?? {});
        await cacheRecords(data?.records ?? {});
      } catch {
        /* sin red: conservamos lo que haya en memoria */
      }
    } finally {
      setPending(await countQueued());
      setSyncing(false);
    }
  }, [syncing]);

  // Escucha cambios de conectividad del navegador.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      flushQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flushQueue]);

  // Load today's visit records: del backend si hay red (y se cachea cifrado),
  // o de la caché cifrada local si estamos offline.
  useEffect(() => {
    if (status !== "authed") return;
    let active = true;
    (async () => {
      setPending(await countQueued());
      try {
        const data = await api.visitsToday();
        if (!active) return;
        setRecords(data?.records ?? {});
        await cacheRecords(data?.records ?? {});
        await flushQueue();
      } catch {
        // Sin red: usar la copia local cifrada.
        const cached = await readCachedRecords();
        if (active) setRecords(cached ?? {});
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Obtiene la ubicación GPS real y pide al backend las tiendas cercanas
  // (Haversine, radio ~2 km). No hay asignación fija por promotor.
  const loadNearbyStores = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setStoresError("Este dispositivo no soporta geolocalización.");
      return;
    }
    setStoresLoading(true);
    setStoresError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDashCoords(coords);
        try {
          const data = await api.nearbyStores(coords.lat, coords.lng);
          setNearbyStores(data?.stores ?? []);
          if (typeof data?.radius === "number") setNearbyRadius(data.radius);
        } catch (e) {
          setStoresError(
            e instanceof ApiError ? e.message : "No se pudieron cargar las tiendas cercanas."
          );
        } finally {
          setStoresLoading(false);
        }
      },
      (err) => {
        setStoresLoading(false);
        setStoresError(gpsErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
  }, []);

  // Al entrar al dashboard con sesión, carga las tiendas cercanas.
  useEffect(() => {
    if (status === "authed" && screen === "dashboard") loadNearbyStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, screen]);

  // Carga el catálogo COMPLETO de tiendas (para pintarlas todas en el mapa).
  useEffect(() => {
    if (status !== "authed") return;
    const ctrl = new AbortController();
    api
      .allStores(ctrl.signal)
      .then((data) => setAllStores(data?.stores ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [status]);

  // GPS REAL únicamente (sin modo simulación). Observa la ubicación del
  // dispositivo mientras se está en la pantalla de una tienda.
  useEffect(() => {
    if (screen !== "storeDetail" || !store) return;
    setGpsCoords(null);
    setGpsAccuracy(null);
    setGpsError(null);
    if (!("geolocation" in navigator)) {
      setGpsError("Este dispositivo no soporta geolocalización.");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsAccuracy(pos.coords.accuracy);
        setGpsError(null);
      },
      (err) => {
        setGpsCoords(null);
        setGpsError(gpsErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [screen, store]);

  // Radio real que aplica el servidor (configurable con CHECK_IN_RADIUS_METERS).
  // Lo envía la sesión; si aún no llegó, usa el valor por defecto del cliente.
  const radiusMeters = user?.checkInRadiusMeters ?? RANGE_METERS;

  // Distancia INFORMATIVA para la UI (el servidor es la autoridad). Se calcula
  // solo si hay un fix GPS real.
  const distance = store && gpsCoords
    ? distanceMeters(gpsCoords.lat, gpsCoords.lng, store.lat, store.lng)
    : null;
  const inRange = distance != null && distance <= radiusMeters;

  function openStore(storeObj) {
    setSelectedStore(storeObj);
    setRollos(0);
    setCubetas(0);
    setPhoto(null);
    setGpsCoords(null);
    setGpsAccuracy(null);
    setGpsError(null);
    setScreen("storeDetail");
  }

  async function handlePhotoChange(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await resizeImage(file));
    } catch (err) {
      alert(err.message || "No se pudo procesar la foto.");
    } finally {
      setPhotoBusy(false);
    }
  }

  // Actualiza el estado en memoria y refresca la caché cifrada en disco.
  async function persistRecords(next) {
    setRecords(next);
    await cacheRecords(next);
  }

  // Guarda una acción sin red: la encola CIFRADA y refleja el estado optimista.
  async function queueOffline(type, payload, optimisticRecord) {
    await enqueueAction({ type, storeId: store.id, payload });
    setPending(await countQueued());
    await persistRecords({ ...records, [store.id]: { ...optimisticRecord, pendingSync: true } });
  }

  async function handleCheckIn() {
    if (busy) return;
    if (!gpsCoords) {
      alert("Esperando tu ubicación GPS. Actívala e inténtalo de nuevo.");
      return;
    }
    if (!photo) {
      alert("Debes tomar la foto de la visita antes de registrar la entrada.");
      return;
    }
    setBusy(true);
    const coords = gpsCoords; // coordenadas GPS reales; el servidor valida la distancia
    // La foto (Base64) va en el payload. Offline: se cifra con AES-GCM en la
    // bóveda antes de tocar IndexedDB. hasPhoto marca el registro optimista.
    const payload = { coords, photo };
    const optimistic = {
      storeId: store.id,
      status: "checked-in",
      checkInTime: new Date().toISOString(),
      checkInDistance: Math.round(distance),
      hasPhoto: true,
    };
    try {
      if (!navigator.onLine) {
        await queueOffline("check-in", payload, optimistic);
        setPhoto(null);
        return;
      }
      // El backend revalida identidad, distancia, hora y la foto obligatoria.
      const rec = await api.checkIn(store.id, payload);
      await persistRecords({ ...records, [store.id]: rec });
      setPhoto(null);
    } catch (e) {
      if (e instanceof ApiError) {
        alert(e.message || "No se pudo registrar la entrada."); // rechazo del servidor
      } else {
        await queueOffline("check-in", payload, optimistic); // fallo de red → offline
        setPhoto(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmCheckout() {
    if (busy) return;
    if (!gpsCoords) {
      alert("Esperando tu ubicación GPS. Actívala e inténtalo de nuevo.");
      return;
    }
    setBusy(true);
    const coords = gpsCoords; // coordenadas GPS reales
    const optimistic = {
      ...(record || { storeId: store.id }),
      status: "checked-out",
      checkOutTime: new Date().toISOString(),
      checkOutDistance: Math.round(distance),
      rollos,
      cubetas,
    };
    try {
      if (!navigator.onLine) {
        await queueOffline("check-out", { coords, rollos, cubetas }, optimistic);
        setShowSheet(false);
        return;
      }
      const rec = await api.checkOut(store.id, { coords, rollos, cubetas });
      await persistRecords({ ...records, [store.id]: rec });
      setShowSheet(false);
    } catch (e) {
      if (e instanceof ApiError) {
        alert(e.message || "No se pudo registrar la salida.");
      } else {
        await queueOffline("check-out", { coords, rollos, cubetas }, optimistic);
        setShowSheet(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    if (loggingIn) return;
    if (!promoterId.trim() || !password) return;
    setLoggingIn(true);
    try {
      const ok = await login(promoterId.trim(), password);
      if (ok) setPassword("");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await logout();
    setRecords({});
    setSelectedStore(null);
    setNearbyStores([]);
    setDashCoords(null);
    setScreen("dashboard");
    setPromoterId("");
    setPassword("");
  }

  // Navegación entre las secciones del footer.
  function goTab(key) {
    setSelectedStore(null);
    setScreen(key);
  }

  // Fotos del formulario de Competencia (previsualización en el cliente).
  async function handleCompFotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      try {
        setCompFotos((prev) => [...prev, { name: file.name, url: URL.createObjectURL(file) }]);
      } catch {
        /* ignora archivos inválidos */
      }
    }
  }

  const bgTexture = {
    backgroundColor: COLORS.bg,
    backgroundImage: `linear-gradient(${COLORS.border}22 1px, transparent 1px), linear-gradient(90deg, ${COLORS.border}22 1px, transparent 1px)`,
    backgroundSize: "28px 28px",
  };

  // --- Session bootstrap ----------------------------------------------------
  if (status === "loading") {
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", color: COLORS.textMuted, fontSize: 14 }}>
        Cargando sesión…
      </div>
    );
  }

  // --- Login (ID de promotor + contraseña) ----------------------------------
  if (status !== "authed" || !user) {
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Inter" }}>
        <div style={{ width: "100%", maxWidth: 360, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "32px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Navigation size={17} color={COLORS.accentText} />
            </div>
            <span style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: "0.1em", color: COLORS.textMuted, fontWeight: 600 }}>PROMOTORES DE CAMPO</span>
          </div>
          <h1 style={{ fontFamily: "Space Grotesk", fontSize: 24, fontWeight: 600, color: COLORS.text, margin: "0 0 6px" }}>Registro de visitas</h1>
          <p style={{ fontSize: 13, color: COLORS.textMuted, margin: "0 0 24px", lineHeight: 1.5 }}>
            Ingresa tu ID de promotor y contraseña para ver las tiendas cercanas a tu ubicación.
          </p>

          <label style={{ fontSize: 12, color: COLORS.textMuted, display: "block", marginBottom: 6 }}>ID de promotor</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
            <User size={16} color={COLORS.textMuted} />
            <input
              value={promoterId}
              onChange={(e) => setPromoterId(e.target.value)}
              placeholder="90500276"
              inputMode="numeric"
              style={{ background: "transparent", border: "none", outline: "none", color: COLORS.text, fontFamily: "JetBrains Mono", fontSize: 16, width: "100%" }}
            />
          </div>

          <label style={{ fontSize: 12, color: COLORS.textMuted, display: "block", marginBottom: 6 }}>Contraseña</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <Lock size={16} color={COLORS.textMuted} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{ background: "transparent", border: "none", outline: "none", color: COLORS.text, fontFamily: "Inter", fontSize: 16, width: "100%" }}
            />
          </div>

          {authError && <p style={{ color: COLORS.danger, fontSize: 12.5, margin: "6px 0 0" }}>{authError}</p>}

          <button
            onClick={handleLogin}
            disabled={loggingIn || !promoterId.trim() || !password}
            style={{ width: "100%", marginTop: 18, padding: "12px 0", borderRadius: 10, border: "none", background: promoterId.trim() && password ? COLORS.accent : COLORS.surface2, color: promoterId.trim() && password ? COLORS.onAccent : COLORS.textMuted, fontFamily: "Inter", fontWeight: 600, fontSize: 14.5, cursor: loggingIn || !promoterId.trim() || !password ? "not-allowed" : "pointer" }}
          >
            {loggingIn ? "Ingresando…" : "Iniciar sesión"}
          </button>

          <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 22, lineHeight: 1.6 }}>
            Tu contraseña se verifica en el servidor (hash bcrypt). La sesión se guarda en una cookie HttpOnly; ningún token queda expuesto en el navegador.
          </p>
        </div>
      </div>
    );
  }

  // --- Dashboard ------------------------------------------------------------
  if (screen === "dashboard") {
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh", fontFamily: "Inter" }}>
        <TopBar user={user} onFeedback={() => setShowFeedback(true)} onProfile={() => goTab("perfil")} />
        <ConnectivityBanner online={online} pending={pending} syncing={syncing} onSync={flushQueue} />
        {showFeedback && <FeedbackModal user={user} onClose={() => setShowFeedback(false)} />}
        <div style={{ padding: "20px 20px 96px", maxWidth: 480, margin: "0 auto" }}>
          <span style={{ fontSize: 11, letterSpacing: "0.1em", color: COLORS.textMuted, fontWeight: 600 }}>TU UBICACIÓN</span>
          <MapView coords={dashCoords} stores={allStores} />

          <SalesGoals records={records} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, letterSpacing: "0.1em", color: COLORS.textMuted, fontWeight: 600 }}>
              TIENDAS CERCANAS {dashCoords ? `(${(nearbyRadius / 1000).toFixed(nearbyRadius % 1000 ? 1 : 0)} km)` : ""}
            </span>
            <button
              onClick={loadNearbyStores}
              disabled={storesLoading}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "5px 10px", color: COLORS.textMuted, fontSize: 11.5, cursor: storesLoading ? "default" : "pointer" }}
            >
              <RefreshCw size={13} /> {storesLoading ? "Buscando…" : "Actualizar"}
            </button>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {storesError && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.4 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{storesError}</span>
              </div>
            )}
            {!storesError && storesLoading && stores.length === 0 && (
              <p style={{ color: COLORS.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <Navigation size={15} /> Obteniendo tu ubicación y buscando tiendas cercanas…
              </p>
            )}
            {!storesError && !storesLoading && stores.length === 0 && dashCoords && (
              <p style={{ color: COLORS.textMuted, fontSize: 13 }}>
                No hay tiendas dentro de {(nearbyRadius / 1000).toFixed(nearbyRadius % 1000 ? 1 : 0)} km de tu ubicación.
              </p>
            )}
            {stores.map((s) => {
              const rec = records[s.id];
              const status2 = rec?.status === "checked-out" ? "done" : rec?.status === "checked-in" ? "in" : "none";
              return (
                <button
                  key={s.id}
                  onClick={() => openStore(s)}
                  style={{ textAlign: "left", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "16px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: COLORS.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <MapPin size={18} color={COLORS.textMuted} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: COLORS.text, fontSize: 14.5, fontWeight: 600 }}>{s.name} - {s.id}</p>
                    {s.address && s.address !== `Tienda #${s.id}` && (
                      <p style={{ margin: "2px 0 0", color: COLORS.textMuted, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {typeof s.distance === "number" && (
                      <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "JetBrains Mono" }}>{fmtDistance(s.distance)}</span>
                    )}
                    <StatusPill status={status2} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <FooterNav current="dashboard" onNavigate={goTab} />
      </div>
    );
  }

  // --- Store detail ---------------------------------------------------------
  if (screen === "storeDetail" && store) {
    const isDone = record?.status === "checked-out";
    const isCheckedIn = record?.status === "checked-in";
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh", fontFamily: "Inter" }}>
        <TopBar user={user} onFeedback={() => setShowFeedback(true)} onProfile={() => goTab("perfil")} />
        <ConnectivityBanner online={online} pending={pending} syncing={syncing} onSync={flushQueue} />
        {showFeedback && <FeedbackModal user={user} onClose={() => setShowFeedback(false)} />}
        <div style={{ padding: "18px 20px 40px", maxWidth: 460, margin: "0 auto" }}>
          <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}>
            <ArrowLeft size={15} /> Tiendas
          </button>

          <h2 style={{ fontFamily: "Space Grotesk", fontSize: 20, fontWeight: 600, color: COLORS.text, margin: "0 0 2px" }}>{store.name}</h2>
          <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: "0 0 22px" }}>{store.address}</p>

          {!isDone && (
            <>
              <Radar distance={distance} inRange={inRange} gpsError={gpsError} hasFix={!!gpsCoords} />

              <div style={{ marginTop: 18, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <Navigation size={16} color={gpsError ? COLORS.danger : gpsCoords ? COLORS.success : COLORS.textMuted} />
                <span style={{ fontSize: 12.5, color: gpsError ? COLORS.danger : COLORS.textMuted, lineHeight: 1.4 }}>
                  {gpsError
                    ? gpsError
                    : gpsCoords
                    ? `Ubicación GPS activa${gpsAccuracy ? ` · precisión ±${Math.round(gpsAccuracy)} m` : ""}`
                    : "Obteniendo tu ubicación GPS…"}
                </span>
              </div>

              {isCheckedIn && (
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, color: COLORS.textMuted, fontSize: 13 }}>
                  <Clock size={15} />
                  <span>En tienda desde las {fmtTime(record.checkInTime)} · {fmtDuration(record.checkInTime)}</span>
                </div>
              )}

              {!isCheckedIn && (
                <div style={{ marginTop: 18 }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.08em", color: COLORS.textMuted, fontWeight: 600 }}>
                    FOTO DE LA VISITA (OBLIGATORIA)
                  </span>
                  {/* input de cámara: en móvil abre la cámara trasera */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoChange}
                    style={{ display: "none" }}
                  />
                  {!photo ? (
                    <button
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      disabled={photoBusy}
                      style={{ width: "100%", marginTop: 10, padding: "13px 0", borderRadius: 12, border: `1px dashed ${COLORS.border}`, background: COLORS.surface2, color: COLORS.text, fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <Camera size={16} color={COLORS.accentText} />
                      {photoBusy ? "Procesando…" : "Tomar foto"}
                    </button>
                  ) : (
                    <div style={{ marginTop: 10, position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
                      <img src={photo} alt="Foto de la visita" style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover" }} />
                      <button
                        onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        style={{ position: "absolute", right: 10, bottom: 10, padding: "7px 12px", borderRadius: 9, border: "none", background: "rgba(15,22,32,0.82)", color: COLORS.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <Camera size={14} /> Retomar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!isCheckedIn && (
                <button
                  onClick={handleCheckIn}
                  disabled={!gpsCoords || !photo || busy}
                  style={{
                    width: "100%", marginTop: 16, padding: "14px 0", borderRadius: 12, border: "none",
                    background: gpsCoords && photo ? COLORS.accent : COLORS.surface2,
                    color: gpsCoords && photo ? COLORS.onAccent : COLORS.textMuted,
                    fontFamily: "Inter", fontWeight: 600, fontSize: 15, cursor: gpsCoords && photo && !busy ? "pointer" : "not-allowed",
                  }}
                >
                  {busy ? "Registrando…" : "Registrar entrada"}
                </button>
              )}

              {!isCheckedIn && gpsCoords && !photo && (
                <p style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: COLORS.textMuted, marginTop: 10, lineHeight: 1.5 }}>
                  <Camera size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Toma la foto de la visita para habilitar el registro de entrada.
                </p>
              )}

              {isCheckedIn && (
                <button
                  onClick={() => setShowSheet(true)}
                  disabled={!gpsCoords}
                  style={{
                    width: "100%", marginTop: 20, padding: "14px 0", borderRadius: 12, border: "none",
                    background: gpsCoords ? COLORS.success : COLORS.surface2,
                    color: gpsCoords ? COLORS.onSuccess : COLORS.textMuted,
                    fontFamily: "Inter", fontWeight: 600, fontSize: 15, cursor: gpsCoords ? "pointer" : "not-allowed",
                  }}
                >
                  Registrar salida
                </button>
              )}

              {/* Aviso informativo: el servidor es quien valida el radio real. */}
              {gpsCoords && !inRange && (
                <p style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: COLORS.textMuted, marginTop: 12, lineHeight: 1.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Parece que estás a {fmtDistance(distance)} de la tienda. Debes estar a {fmtDistance(radiusMeters)} o menos; el servidor validará tu ubicación al registrar.
                </p>
              )}
            </>
          )}

          {isDone && (
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: COLORS.successSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={18} color={COLORS.success} />
                </div>
                <span style={{ fontFamily: "Space Grotesk", fontSize: 16, fontWeight: 600, color: COLORS.text }}>Visita completada</span>
              </div>
              <Row label="Entrada" value={`${fmtTime(record.checkInTime)}`} />
              <Row label="Salida" value={`${fmtTime(record.checkOutTime)}`} />
              <Row label="Duracion" value={fmtDuration(record.checkInTime, record.checkOutTime)} />
              <Row label="Rollos vendidos" value={record.rollos} />
              <Row label="Cubetas vendidas" value={record.cubetas} last />
              <button
                onClick={() => setScreen("dashboard")}
                style={{ width: "100%", marginTop: 18, padding: "12px 0", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, color: COLORS.text, fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                Volver a tiendas
              </button>
            </div>
          )}
        </div>

        {showSheet && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,12,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
            <div style={{ width: "100%", maxWidth: 460, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "22px 22px 26px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border, margin: "0 auto 18px" }} />
              <h3 style={{ fontFamily: "Space Grotesk", fontSize: 17, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" }}>Reporte del dia</h3>
              <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: "0 0 6px" }}>Captura lo vendido antes de confirmar tu salida.</p>

              <Stepper label="Rollos" value={rollos} onChange={setRollos} />
              <Stepper label="Cubetas" value={cubetas} onChange={setCubetas} />

              {/* Aviso informativo (no bloquea): el servidor valida la distancia real. */}
              {gpsCoords && !inRange && (
                <p style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: COLORS.textMuted, marginTop: 14, lineHeight: 1.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Debes estar en la sucursal (a {fmtDistance(radiusMeters)} o menos). El servidor validará tu ubicación al confirmar.
                </p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => setShowSheet(false)}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmCheckout}
                  disabled={!gpsCoords || busy}
                  style={{
                    flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
                    background: gpsCoords ? COLORS.success : COLORS.surface2,
                    color: gpsCoords ? COLORS.onSuccess : COLORS.textMuted,
                    fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: gpsCoords && !busy ? "pointer" : "not-allowed",
                  }}
                >
                  {busy ? "Confirmando…" : "Confirmar salida"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Competencia (formulario de acciones/estrategias de la competencia) ---
  if (screen === "competencia") {
    const canSendComp = compMarca.trim() && compDesc.trim();
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh" }}>
        <TopBar user={user} onFeedback={() => setShowFeedback(true)} onProfile={() => goTab("perfil")} />
        <ConnectivityBanner online={online} pending={pending} syncing={syncing} onSync={flushQueue} />
        {showFeedback && <FeedbackModal user={user} onClose={() => setShowFeedback(false)} />}
        <div style={{ padding: "20px 20px 96px", maxWidth: 480, margin: "0 auto" }}>
          <span style={{ fontSize: 11, letterSpacing: "0.1em", color: COLORS.textMuted, fontWeight: 600 }}>COMPETENCIA</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, margin: "2px 0 4px" }}>Reportar acción</h2>
          <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>
            Sube estrategias, material gráfico o acciones de la competencia.
          </p>

          {compSent ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: COLORS.successSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Check size={24} color={COLORS.success} />
              </div>
              <p style={{ color: COLORS.text, fontWeight: 600, margin: "0 0 6px" }}>¡Reporte capturado!</p>
              <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>
                El guardado en el servidor se conectará próximamente (misma integración de fotos que el check-in).
              </p>
              <button
                onClick={() => { setCompSent(false); setCompMarca(""); setCompDesc(""); setCompFotos([]); }}
                style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: COLORS.accent, color: COLORS.onAccent, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Nuevo reporte
              </button>
            </div>
          ) : (
            <>
              <label style={{ fontSize: 12, color: COLORS.textMuted, display: "block", marginBottom: 6, fontWeight: 600 }}>Marca / competidor</label>
              <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
                <input value={compMarca} onChange={(e) => setCompMarca(e.target.value)} placeholder="Ej. Impermeabilizante XYZ" style={{ background: "transparent", border: "none", outline: "none", color: COLORS.text, fontSize: 15, width: "100%" }} />
              </div>

              <label style={{ fontSize: 12, color: COLORS.textMuted, display: "block", marginBottom: 6, fontWeight: 600 }}>Descripción</label>
              <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
                <textarea value={compDesc} onChange={(e) => setCompDesc(e.target.value)} rows={4} maxLength={2000} placeholder="Qué observaste: precio, promoción, material…" style={{ background: "transparent", border: "none", outline: "none", color: COLORS.text, fontSize: 15, width: "100%", resize: "vertical", minHeight: 80, lineHeight: 1.5, display: "block" }} />
              </div>

              <label style={{ fontSize: 12, color: COLORS.textMuted, display: "block", marginBottom: 6, fontWeight: 600 }}>Evidencia (fotos)</label>
              <input ref={compFileRef} type="file" accept="image/*" multiple onChange={handleCompFotos} style={{ display: "none" }} />
              <button
                onClick={() => compFileRef.current && compFileRef.current.click()}
                style={{ width: "100%", padding: "16px 0", borderRadius: 12, border: `1.5px dashed ${COLORS.border}`, background: COLORS.surface2, color: COLORS.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <ImagePlus size={16} color={COLORS.accentText} /> Subir fotos
              </button>
              {compFotos.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {compFotos.map((f, i) => (
                    <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
                      <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        onClick={() => setCompFotos((prev) => prev.filter((_, j) => j !== i))}
                        style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => canSendComp && setCompSent(true)}
                disabled={!canSendComp}
                style={{ width: "100%", marginTop: 18, padding: "14px 0", borderRadius: 12, border: "none", background: canSendComp ? COLORS.accent : COLORS.surface2, color: canSendComp ? COLORS.onAccent : COLORS.textMuted, fontWeight: 700, fontSize: 15, cursor: canSendComp ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Send size={16} /> Enviar reporte
              </button>
              <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 10, lineHeight: 1.5 }}>
                Nota: la interfaz está lista; el guardado en el servidor (info + fotos) se conectará en la siguiente fase.
              </p>
            </>
          )}
        </div>
        <FooterNav current="competencia" onNavigate={goTab} />
      </div>
    );
  }

  // --- Perfil ---------------------------------------------------------------
  if (screen === "perfil") {
    const initials = (user.name || user.id || "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh" }}>
        <TopBar user={user} onFeedback={() => setShowFeedback(true)} onProfile={() => goTab("perfil")} />
        <ConnectivityBanner online={online} pending={pending} syncing={syncing} onSync={flushQueue} />
        {showFeedback && <FeedbackModal user={user} onClose={() => setShowFeedback(false)} />}
        <div style={{ padding: "28px 20px 96px", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: COLORS.accentSoft, color: COLORS.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, margin: "0 auto 12px" }}>
            {initials}
          </div>
          <h2 style={{ textAlign: "center", fontSize: 19, fontWeight: 700, color: COLORS.text, margin: "0 0 2px" }}>{user.name}</h2>
          <p style={{ textAlign: "center", fontSize: 12.5, color: COLORS.textMuted, margin: "0 0 22px" }}>Promotor de campo</p>
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "6px 16px" }}>
            <Row label="ID" value={user.id} />
            <Row label="Ubicación" value={user.location || "—"} />
            <Row label="Supervisor" value={user.supervisor || "—"} last />
          </div>
          <button
            onClick={handleLogout}
            style={{ width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.text, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
        <FooterNav current="perfil" onNavigate={goTab} />
      </div>
    );
  }

  return null;
}

// Wordmark de marca. PROVISIONAL: cuando llegue el logo oficial de Protexa
// (SVG/PNG positivo y negativo) se reemplaza SOLO aquí por un <img>.
function Brand() {
  // Logo oficial Protexa. El navegador elige la versión según el tema del
  // dispositivo: blanca en modo oscuro, negra en modo claro.
  return (
    <picture style={{ display: "flex", alignItems: "center" }}>
      <source srcSet="/protexa-logo-blanco.png" media="(prefers-color-scheme: dark)" />
      <img src="/protexa-logo-negro.png" alt="Protexa · Desde 1945" style={{ height: 28, width: "auto", display: "block" }} />
    </picture>
  );
}

function TopBar({ user, onFeedback, onProfile }) {
  const initials = (user.name || user.id || "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
      <Brand />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onFeedback && (
          <button
            onClick={onFeedback}
            title="Reportar un problema"
            style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}`, borderRadius: 9, padding: "7px 12px", color: COLORS.accentText, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <MessageSquare size={14} /> Reportar
          </button>
        )}
        <button
          onClick={onProfile}
          title="Mi perfil"
          style={{ width: 34, height: 34, borderRadius: "50%", background: COLORS.accentSoft, color: COLORS.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          {initials}
        </button>
      </div>
    </div>
  );
}

// Barra de navegación inferior (footer). Capacitación y Soporte quedan
// deshabilitadas por ahora (se implementan después).
function FooterNav({ current, onNavigate }) {
  // Capacitación y Soporte abren sus NotebookLM (Google) en una pestaña nueva.
  const items = [
    { key: "dashboard", label: "Inicio", Icon: Home },
    { key: "competencia", label: "Competencia", Icon: BarChart3 },
    { key: "capacitacion", label: "Capacitación", Icon: GraduationCap, href: "https://notebook.google.com/notebook/a632f11d-4361-410d-add1-410cfa806e34/preview" },
    { key: "soporte", label: "Soporte", Icon: LifeBuoy, href: "https://notebook.google.com/notebook/8587af76-29d1-489b-8442-725daabceb69/preview" },
    { key: "perfil", label: "Perfil", Icon: User },
  ];
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, zIndex: 40, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex" }}>
        {items.map(({ key, label, Icon, href }) => {
          const active = current === key;
          const color = active ? COLORS.accentText : COLORS.textMuted;
          return (
            <button
              key={key}
              onClick={() => (href ? window.open(href, "_blank", "noopener,noreferrer") : onNavigate(key))}
              title={label}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 0 11px", background: "none", border: "none", color, cursor: "pointer" }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 9.5, fontWeight: 600 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConnectivityBanner({ online, pending, syncing, onSync }) {
  if (online && pending === 0) return null; // todo sincronizado y con red: sin banner
  const offline = !online;
  const bg = offline ? COLORS.dangerSoft : COLORS.accentSoft;
  const color = offline ? COLORS.danger : COLORS.accentText;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 14px", background: bg, color, fontSize: 12.5, fontWeight: 600 }}>
      {offline ? <WifiOff size={14} /> : <RefreshCw size={14} />}
      <span>
        {offline
          ? pending > 0
            ? `Sin conexión · ${pending} visita(s) guardada(s) cifradas, se sincronizarán al reconectar`
            : "Sin conexión · los registros se guardarán cifrados en el dispositivo"
          : `${pending} visita(s) pendiente(s) de sincronizar`}
      </span>
      {online && pending > 0 && (
        <button
          onClick={onSync}
          disabled={syncing}
          style={{ marginLeft: 6, background: "none", border: `1px solid ${color}`, color, borderRadius: 8, padding: "2px 8px", fontSize: 11.5, cursor: syncing ? "default" : "pointer" }}
        >
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    none: { label: "Sin visitar", color: COLORS.textMuted, bg: COLORS.surface2 },
    in: { label: "En tienda", color: COLORS.accentText, bg: COLORS.accentSoft },
    done: { label: "Completada", color: COLORS.success, bg: COLORS.successSoft },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: last ? "none" : `1px solid ${COLORS.border}` }}>
      <span style={{ fontSize: 13, color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, fontFamily: "JetBrains Mono" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedbackModal — reporte de retroalimentación del asesor.
// ---------------------------------------------------------------------------
// Modal (bottom-sheet, como el reporte de salida) donde el asesor describe un
// problema. ID y nombre vienen autollenados desde la sesión pero son editables;
// la sucursal se escribe a mano (para poder reportar sucursales que no aparecen
// en el catálogo) y la descripción es un campo amplio. Al enviar, se guarda una
// fila en la pestaña de retroalimentación del Google Sheet.
function FeedbackModal({ user, onClose }) {
  const [idPromotor, setIdPromotor] = useState(user?.id ?? "");
  const [nombre, setNombre] = useState(user?.name ?? "");
  const [sucursal, setSucursal] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");
  const [loc, setLoc] = useState({ status: "loading", coords: null }); // ubicación en tiempo real

  // Captura la ubicación GPS real al abrir el modal.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLoc({ status: "error", coords: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLoc({ status: "ok", coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setLoc({ status: "error", coords: null }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  const canSend = sucursal.trim().length > 0 && descripcion.trim().length > 0 && state !== "sending";

  async function handleSubmit() {
    if (!canSend) return;
    setState("sending");
    setErrorMsg("");
    try {
      await api.sendFeedback({
        idPromotor: idPromotor.trim(),
        nombre: nombre.trim(),
        sucursal: sucursal.trim(),
        descripcion: descripcion.trim(),
        ubicacion: loc.coords ? `${loc.coords.lat.toFixed(6)},${loc.coords.lng.toFixed(6)}` : "",
      });
      setState("sent");
    } catch (e) {
      setState("error");
      setErrorMsg(
        e instanceof ApiError
          ? e.message
          : "No hay conexión. Revisa tu internet e inténtalo de nuevo."
      );
    }
  }

  const labelStyle = { fontSize: 12, color: COLORS.textMuted, display: "block", marginBottom: 6, fontWeight: 600 };
  const fieldWrap = { background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14 };
  const inputStyle = { background: "transparent", border: "none", outline: "none", color: COLORS.text, fontFamily: "Inter", fontSize: 15, width: "100%" };

  return (
    <div
      onClick={() => state !== "sending" && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(5,8,12,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "92dvh", overflowY: "auto", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "22px 22px 26px" }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border, margin: "0 auto 18px" }} />

        {state === "sent" ? (
          <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: COLORS.successSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Check size={24} color={COLORS.success} />
            </div>
            <h3 style={{ fontFamily: "Space Grotesk", fontSize: 18, fontWeight: 600, color: COLORS.text, margin: "0 0 6px" }}>¡Gracias por tu reporte!</h3>
            <p style={{ fontSize: 13, color: COLORS.textMuted, margin: "0 0 20px", lineHeight: 1.5 }}>
              Tu retroalimentación se registró. El equipo de Inteligencia Comercial la revisará.
            </p>
            <button
              onClick={onClose}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: COLORS.accent, color: COLORS.onAccent, fontFamily: "Inter", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <div>
                <h3 style={{ fontFamily: "Space Grotesk", fontSize: 17, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" }}>Reportar un problema</h3>
                <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>
                  Cuéntanos qué pasó con el mayor detalle posible para poder ayudarte.
                </p>
              </div>
              <button
                onClick={() => state !== "sending" && onClose()}
                aria-label="Cerrar"
                style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, color: COLORS.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>ID del promotor</label>
                <div style={fieldWrap}>
                  <input
                    value={idPromotor}
                    onChange={(e) => setIdPromotor(e.target.value)}
                    inputMode="numeric"
                    placeholder="987654"
                    style={{ ...inputStyle, fontFamily: "JetBrains Mono", fontSize: 15 }}
                  />
                </div>
              </div>
              <div style={{ flex: 1.4 }}>
                <label style={labelStyle}>Nombre</label>
                <div style={fieldWrap}>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre del asesor"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            <label style={labelStyle}>Sucursal</label>
            <div style={fieldWrap}>
              <input
                value={sucursal}
                onChange={(e) => setSucursal(e.target.value)}
                placeholder="Ej. Morelia, Michoacán"
                style={inputStyle}
              />
            </div>

            <label style={labelStyle}>Ubicación (en tiempo real)</label>
            <div style={{ ...fieldWrap, display: "flex", alignItems: "center", gap: 9 }}>
              <MapPin size={16} color={loc.status === "ok" ? COLORS.accentText : COLORS.textMuted} style={{ flexShrink: 0 }} />
              <span style={{ color: loc.status === "ok" ? COLORS.text : COLORS.textMuted, fontSize: 13.5, fontFamily: "JetBrains Mono" }}>
                {loc.status === "ok"
                  ? `${loc.coords.lat.toFixed(4)}, ${loc.coords.lng.toFixed(4)}`
                  : loc.status === "loading"
                  ? "Obteniendo ubicación…"
                  : "Ubicación no disponible"}
              </span>
              {loc.status === "ok" && (
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, color: COLORS.success, fontSize: 11, fontWeight: 700 }}>
                  <Check size={13} /> Capturada
                </span>
              )}
            </div>

            <label style={labelStyle}>Describe el problema</label>
            <div style={{ ...fieldWrap, padding: "10px 12px" }}>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Ej. Estoy en la sucursal de Morelia en Michoacán y no he logrado hacer el check in porque no me aparece mi sucursal. ¿Qué puedo hacer?"
                style={{ ...inputStyle, resize: "vertical", minHeight: 96, lineHeight: 1.5, display: "block" }}
              />
            </div>

            {state === "error" && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.4, marginBottom: 14 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                onClick={() => state !== "sending" && onClose()}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                style={{
                  flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
                  background: canSend ? COLORS.accent : COLORS.surface2,
                  color: canSend ? COLORS.onAccent : COLORS.textMuted,
                  fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: canSend ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {state === "sending" ? "Enviando…" : (<><Send size={15} /> Enviar reporte</>)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
