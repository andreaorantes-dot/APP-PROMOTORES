# Credenciales — Google Service Account

Coloca aquí la clave **JSON** del Service Account para la integración con Google
Sheets. **Este archivo JSON nunca se versiona** (`.gitignore` solo conserva este
README).

## Pasos

1. **Google Cloud Console** → crea (o elige) un proyecto.
2. **APIs y servicios → Biblioteca** → habilita **Google Sheets API**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
4. En la cuenta de servicio → pestaña **Claves → Agregar clave → JSON**. Descarga
   el archivo y guárdalo aquí como:

   ```
   backend/credentials/service-account.json
   ```

5. Abre ese JSON y copia el valor de **`client_email`** (algo como
   `promotores-sheets@tu-proyecto.iam.gserviceaccount.com`).
6. Abre tu documento de **Google Sheets** → **Compartir** → pega ese
   `client_email` con permiso de **Editor**.
7. Copia el **ID del documento** (de la URL:
   `https://docs.google.com/spreadsheets/d/`**`<ESTE_ID>`**`/edit`).
8. Configura `backend/.env`:

   ```
   GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
   GOOGLE_SHEETS_ID=<ESTE_ID>
   GOOGLE_SHEETS_TAB=Visitas
   ```

9. (Opcional) En el Sheet, crea una pestaña llamada **Visitas** con encabezados:
   `registrado_en | id_promotor | nombre | tienda | hora_entrada | hora_salida | rollos | cubetas`.

10. Reinicia el backend. Al hacer un **check-out**, se agregará una fila.

> Si estas variables quedan vacías, el check-out funciona igual y la escritura en
> Sheets se omite (best-effort).
