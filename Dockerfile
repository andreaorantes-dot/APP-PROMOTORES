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

# Aplica migraciones y arranca. El SEED (con los CSV reales) es un paso del
# operador: monta los CSV y corre `npm run db:seed` una vez (ver DEPLOY.md).
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
