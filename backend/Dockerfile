# Multi-stage build: a full Node toolchain (needed for Prisma's generate
# step and TypeScript compilation) is not something the running container
# needs — only the compiled output and production dependencies do. Keeps
# the final image meaningfully smaller and reduces its attack surface.

FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

# Runs as an unprivileged user — the default node:20-slim image already
# provides one rather than needing a custom useradd.
USER node

EXPOSE 4000

# Same real DB+Redis check the app's own /health endpoint performs,
# reused here so `docker inspect` and orchestrators relying on
# HEALTHCHECK (not every deployment target reads the HTTP endpoint
# directly) get an accurate signal too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
