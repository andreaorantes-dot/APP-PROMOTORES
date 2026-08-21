# --- Etapa 1: build del frontend (Vite) ------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build

# --- Etapa 2: runtime (Express sirve API + frontend estático) ---------------
FROM node:20-slim AS runtime
# Prisma necesita openssl.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
# Copia el build del frontend a /app/dist (server.js lo sirve desde ../../dist).
COPY --from=frontend /app/dist /app/dist

ENV NODE_ENV=production
ENV SERVE_STATIC=true
ENV PORT=8080
EXPOSE 8080

# Crea/actualiza las tablas directamente desde el esquema (no usamos archivos de
# migración) y arranca. Con AUTH_SOURCE=sheet y STORES_SOURCE=sheet los datos
# vienen del Google Sheet en runtime, así que no se siembra desde CSV aquí.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/server.js"]
