import { useState, useEffect, useRef, useCallback } from "react";
import { LogOut, MapPin, ArrowLeft, Check, Minus, Plus, Navigation, AlertTriangle, Clock, WifiOff, RefreshCw, Camera, User, Lock } from "lucide-react";
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

const COLORS = {
  bg: "#0F1620",
  surface: "#161F2B",
  surface2: "#1D2836",
  border: "#28323F",
  text: "#EDF2F7",
  textMuted: "#8CA0B3",
  accent: "#FF6B35",
  accentSoft: "rgba(255,107,53,0.14)",
  success: "#2DD9A8",
  successSoft: "rgba(45,217,168,0.14)",
  danger: "#F2545B",
  dangerSoft: "rgba(242,84,91,0.14)",
};

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

function useGoogleFonts() {
  useEffect(() => {
    const id = "promotores-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

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
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${COLORS.accent}`, background: COLORS.accentSoft, color: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
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
  const statusColor = gpsError ? COLORS.danger : inRange ? COLORS.success : waiting ? COLORS.textMuted : COLORS.accent;
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

export default function PromotoresApp() {
  useGoogleFonts();

  const { status, user, error: authError, login, logout } = useAuth();

  const [screen, setScreen] = useState("dashboard");
  const [records, setRecords] = useState({});
  const [selectedStore, setSelectedStore] = useState(null);
  const [busy, setBusy] = useState(false);

  // Tiendas cercanas (por GPS). No hay asignación fija por promotor.
  const [nearbyStores, setNearbyStores] = useState([]);
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

  // Distancia INFORMATIVA para la UI (el servidor es la autoridad). Se calcula
  // solo si hay un fix GPS real.
  const distance = store && gpsCoords
    ? distanceMeters(gpsCoords.lat, gpsCoords.lng, store.lat, store.lng)
    : null;
  const inRange = distance != null && distance <= RANGE_METERS;

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
              <Navigation size={17} color={COLORS.accent} />
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
            style={{ width: "100%", marginTop: 18, padding: "12px 0", borderRadius: 10, border: "none", background: promoterId.trim() && password ? COLORS.accent : COLORS.surface2, color: promoterId.trim() && password ? "#1A0D05" : COLORS.textMuted, fontFamily: "Inter", fontWeight: 600, fontSize: 14.5, cursor: loggingIn || !promoterId.trim() || !password ? "not-allowed" : "pointer" }}
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
        <TopBar user={user} onLogout={handleLogout} />
        <ConnectivityBanner online={online} pending={pending} syncing={syncing} onSync={flushQueue} />
        <div style={{ padding: "20px 20px 32px", maxWidth: 480, margin: "0 auto" }}>
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
                    <p style={{ margin: 0, color: COLORS.text, fontSize: 14.5, fontWeight: 600 }}>{s.name}</p>
                    <p style={{ margin: "2px 0 0", color: COLORS.textMuted, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address}</p>
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
      </div>
    );
  }

  // --- Store detail ---------------------------------------------------------
  if (screen === "storeDetail" && store) {
    const isDone = record?.status === "checked-out";
    const isCheckedIn = record?.status === "checked-in";
    return (
      <div style={{ ...bgTexture, minHeight: "100dvh", fontFamily: "Inter" }}>
        <TopBar user={user} onLogout={handleLogout} />
        <ConnectivityBanner online={online} pending={pending} syncing={syncing} onSync={flushQueue} />
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
                      <Camera size={16} color={COLORS.accent} />
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
                    color: gpsCoords && photo ? "#1A0D05" : COLORS.textMuted,
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
                    color: gpsCoords ? "#052E24" : COLORS.textMuted,
                    fontFamily: "Inter", fontWeight: 600, fontSize: 15, cursor: gpsCoords ? "pointer" : "not-allowed",
                  }}
                >
                  Registrar salida
                </button>
              )}

              {/* Aviso informativo: el servidor es quien valida los {RANGE_METERS} m. */}
              {gpsCoords && !inRange && (
                <p style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: COLORS.textMuted, marginTop: 12, lineHeight: 1.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Parece que estás a {fmtDistance(distance)} de la tienda. Debes estar a {RANGE_METERS} m o menos; el servidor validará tu ubicación al registrar.
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

              {!inRange && (
                <p style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: COLORS.danger, marginTop: 14, lineHeight: 1.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Debes estar en la sucursal (a {RANGE_METERS} m o menos) para registrar tu salida.
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
                  disabled={!inRange || busy}
                  style={{
                    flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
                    background: inRange ? COLORS.success : COLORS.surface2,
                    color: inRange ? "#052E24" : COLORS.textMuted,
                    fontFamily: "Inter", fontWeight: 600, fontSize: 14, cursor: inRange && !busy ? "pointer" : "not-allowed",
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

  return null;
}

function TopBar({ user, onLogout }) {
  const initials = (user.name || user.id || "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: COLORS.accentSoft, color: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "Inter" }}>
          {initials}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: COLORS.text }}>{user.name}</p>
          <p style={{ margin: 0, fontSize: 11, color: COLORS.textMuted, fontFamily: "JetBrains Mono" }}>{user.id}{user.location ? ` · ${user.location}` : ""}</p>
        </div>
      </div>
      <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "7px 12px", color: COLORS.textMuted, fontSize: 12.5, cursor: "pointer" }}>
        <LogOut size={14} /> Cerrar sesion
      </button>
    </div>
  );
}

function ConnectivityBanner({ online, pending, syncing, onSync }) {
  if (online && pending === 0) return null; // todo sincronizado y con red: sin banner
  const offline = !online;
  const bg = offline ? COLORS.dangerSoft : COLORS.accentSoft;
  const color = offline ? COLORS.danger : COLORS.accent;
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
    in: { label: "En tienda", color: COLORS.accent, bg: COLORS.accentSoft },
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
