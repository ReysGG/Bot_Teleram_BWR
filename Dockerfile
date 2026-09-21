# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
# The production build runs Prisma generation after the schema is copied. Drop
# only the root postinstall hook here so dependency caching survives migrations.
RUN npm pkg delete scripts.postinstall \
  && npm ci \
  && npm install --no-save --ignore-scripts --include=optional --os=linux --cpu=x64 --libc=glibc sharp@0.35.4

FROM deps AS builder
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 appgroup \
  && useradd --system --uid 1001 --gid appgroup appuser

COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]

FROM base AS migrator
# The migration image only needs the Prisma CLI, not the full Next.js tree.
RUN npm init -y \
  && npm install --no-save prisma@7.9.1 dotenv@17.4.2 \
  && npm cache clean --force

COPY prisma.config.ts ./
COPY prisma ./prisma

CMD ["npx", "prisma", "migrate", "deploy"]
