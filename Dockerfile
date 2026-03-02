# ── Stage 1: deps ────────────────────────────────────────────
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: builder ─────────────────────────────────────────
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Push schema to SQLite now (builder has full TS env to read prisma.config.ts).
# This bakes an empty-but-schema'd dev.db into the image so no runtime init is needed.
RUN npx prisma db push --accept-data-loss

# Build Next.js (standalone output)
# GEMINI_API_KEY placeholder prevents SDK init errors during build-time page collection;
# the real key is injected at runtime via Cloud Run secrets.
ENV GEMINI_API_KEY=build-placeholder
RUN npm run build

# ── Stage 3: runner ──────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update \
  && apt-get install -y ffmpeg openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma client and SQLite DB (with schema already applied)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/@prisma/adapter-better-sqlite3 ./node_modules/@prisma/adapter-better-sqlite3

EXPOSE 8080

CMD ["node", "server.js"]
