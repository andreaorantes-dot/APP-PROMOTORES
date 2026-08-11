import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import PromotoresApp from "./PromotoresApp.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <PromotoresApp />
    </AuthProvider>
  </StrictMode>
);

// PWA: registra el service worker solo en producción (en dev interferiría con
// el hot-reload de Vite). Instalable como app en el celular tras `npm run build`.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

