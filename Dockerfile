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

# Crea/actualiza las tablas desde schema.prisma y arranca.
# NOTA: el repositorio NO tiene carpeta de migraciones (backend/prisma/migrations),
# por lo que `prisma migrate deploy` no creaba ninguna tabla y la app fallaba al
# primer query. `db push` sincroniza el esquema directamente. El flag
# --accept-data-loss evita que el arranque quede esperando una confirmación
# interactiva (es seguro en una base nueva y vacía: solo crea tablas).
# El SEED (con los CSV reales) es un paso del operador (ver DEPLOY.md). Con
# AUTH_SOURCE=sheet y STORES_SOURCE=sheet no hace falta sembrar.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/server.js"]
