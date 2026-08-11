# Conectar Google Sheets (Service Account)

Al hacer **check-out**, el backend agrega una fila al Google Sheet del
administrador. Autenticación con un **Service Account** de Google. El JSON de
credenciales **nunca se versiona** (`.gitignore` solo conserva este README).

## Parte 1 — En Google Cloud (una sola vez)

1. **Google Cloud Console** → crea o elige un proyecto.
2. **APIs y servicios → Biblioteca** → busca y **habilita "Google Sheets API"**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
   Ponle un nombre (p.ej. `promotores-sheets`) y créala.
4. Abre esa cuenta de servicio → pestaña **Claves → Agregar clave → Crear clave
   nueva → JSON**. Se descarga un archivo `.json`.
5. Abre el JSON y copia el valor de **`client_email`**
   (algo como `promotores-sheets@tu-proyecto.iam.gserviceaccount.com`).

## Parte 2 — En tu Google Sheet

6. Crea (o abre) tu documento de Google Sheets.
7. **Compartir** → pega el `client_email` del paso 5 con permiso de **Editor**.
   (Sin esto, el Service Account no puede escribir.)
8. Copia el **ID del documento** desde la URL:
   `https://docs.google.com/spreadsheets/d/`**`ESTE_ID`**`/edit`.
9. (Opcional) La pestaña por defecto es `Visitas`; si usas otro nombre, ponlo en
   `GOOGLE_SHEETS_TAB`. El backend crea solo la fila de encabezados la 1.ª vez.

## Parte 3 — Configurar las credenciales

Elige **una** de las dos formas de dar el JSON:

- **JSON en una variable** (recomendado en la nube): pega el contenido completo
  del JSON en `GOOGLE_SERVICE_ACCOUNT_JSON`.
- **Archivo**: guarda el JSON como `backend/credentials/service-account.json` y
  usa `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json`.

### En Render (producción)

En tu servicio → **Environment**:
- **Environment Variables:**
  - `GOOGLE_SHEETS_ID` = el ID del documento (paso 8).
  - `GOOGLE_SHEETS_TAB` = `Visitas` (o el nombre de tu pestaña).
  - `GOOGLE_SERVICE_ACCOUNT_JSON` = **pega el JSON completo** del Service Account.
- **Save Changes** → Render redepliega.

  *(Alternativa con archivo: en **Secret Files** sube `service-account.json` con
  el contenido del JSON, y pon
  `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/etc/secrets/service-account.json`.)*

### En local

Rellena esos valores en `backend/.env` y reinicia el backend.

## Parte 4 — Verificar la conexión (sin hacer un check-out)

Con sesión iniciada en la app, abre en el navegador:

```
https://<tu-app>.onrender.com/api/sheets/status
```

- `{"configured":true,"ok":true,"spreadsheetTitle":"…"}` → ¡conectado! 🎉
- `{"configured":false,…}` → faltan variables.
- `{"ok":false,"error":"…","hint":"…"}` → revisa que compartiste el documento con
  el `client_email` (Editor) y que habilitaste la Google Sheets API.

Luego haz un **check-out** de prueba: aparecerá una fila nueva en el Sheet con
`registrado_en, id_promotor, nombre, tienda, hora_entrada, hora_salida, rollos, cubetas`.

> Si algo falla o no está configurado, el check-out **sigue funcionando** igual
> (la escritura en Sheets es best-effort y no bloquea al promotor).
