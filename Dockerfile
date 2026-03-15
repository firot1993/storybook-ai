FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: builder ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (standalone output)
# Placeholder prevents SDK init errors during build-time page collection;
# real keys are injected at runtime via Cloud Run env/secrets.
ENV GEMINI_API_KEY=build-placeholder
RUN npm run build

# ── Stage 3: runner ──────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ffmpeg fonts-noto-cjk fonts-noto-cjk-extra \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy PostgreSQL driver dependencies
COPY --from=builder /app/node_modules/pg ./node_modules/pg
COPY --from=builder /app/node_modules/pg-cloudflare ./node_modules/pg-cloudflare
COPY --from=builder /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=builder /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=builder /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=builder /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=builder /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=builder /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=builder /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=builder /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=builder /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=builder /app/node_modules/split2 ./node_modules/split2

# Copy Google Cloud Storage SDK + transitive dependencies
COPY --from=deps /app/node_modules/@google-cloud ./node_modules/@google-cloud
COPY --from=deps /app/node_modules/@tootallnate ./node_modules/@tootallnate
COPY --from=deps /app/node_modules/abort-controller ./node_modules/abort-controller
COPY --from=deps /app/node_modules/async-retry ./node_modules/async-retry
COPY --from=deps /app/node_modules/base64-js ./node_modules/base64-js
COPY --from=deps /app/node_modules/bignumber.js ./node_modules/bignumber.js
COPY --from=deps /app/node_modules/buffer-equal-constant-time ./node_modules/buffer-equal-constant-time
COPY --from=deps /app/node_modules/debug ./node_modules/debug
COPY --from=deps /app/node_modules/duplexify ./node_modules/duplexify
COPY --from=deps /app/node_modules/ecdsa-sig-formatter ./node_modules/ecdsa-sig-formatter
COPY --from=deps /app/node_modules/end-of-stream ./node_modules/end-of-stream
COPY --from=deps /app/node_modules/event-target-shim ./node_modules/event-target-shim
COPY --from=deps /app/node_modules/extend ./node_modules/extend
COPY --from=deps /app/node_modules/fast-xml-parser ./node_modules/fast-xml-parser
COPY --from=deps /app/node_modules/gaxios ./node_modules/gaxios
COPY --from=deps /app/node_modules/gcp-metadata ./node_modules/gcp-metadata
COPY --from=deps /app/node_modules/google-auth-library ./node_modules/google-auth-library
COPY --from=deps /app/node_modules/google-logging-utils ./node_modules/google-logging-utils
COPY --from=deps /app/node_modules/html-entities ./node_modules/html-entities
COPY --from=deps /app/node_modules/inherits ./node_modules/inherits
COPY --from=deps /app/node_modules/json-bigint ./node_modules/json-bigint
COPY --from=deps /app/node_modules/jwa ./node_modules/jwa
COPY --from=deps /app/node_modules/jws ./node_modules/jws
COPY --from=deps /app/node_modules/mime ./node_modules/mime
COPY --from=deps /app/node_modules/ms ./node_modules/ms
COPY --from=deps /app/node_modules/node-fetch ./node_modules/node-fetch
COPY --from=deps /app/node_modules/once ./node_modules/once
COPY --from=deps /app/node_modules/p-limit ./node_modules/p-limit
COPY --from=deps /app/node_modules/readable-stream ./node_modules/readable-stream
COPY --from=deps /app/node_modules/retry ./node_modules/retry
COPY --from=deps /app/node_modules/retry-request ./node_modules/retry-request
COPY --from=deps /app/node_modules/safe-buffer ./node_modules/safe-buffer
COPY --from=deps /app/node_modules/stream-events ./node_modules/stream-events
COPY --from=deps /app/node_modules/stream-shift ./node_modules/stream-shift
COPY --from=deps /app/node_modules/string_decoder ./node_modules/string_decoder
COPY --from=deps /app/node_modules/strnum ./node_modules/strnum
COPY --from=deps /app/node_modules/stubs ./node_modules/stubs
COPY --from=deps /app/node_modules/teeny-request ./node_modules/teeny-request
COPY --from=deps /app/node_modules/util-deprecate ./node_modules/util-deprecate
COPY --from=deps /app/node_modules/uuid ./node_modules/uuid
COPY --from=deps /app/node_modules/wrappy ./node_modules/wrappy
COPY --from=deps /app/node_modules/yocto-queue ./node_modules/yocto-queue

# Persistent file storage (mount a volume here on Cloud Run)
ENV STORAGE_LOCAL_PATH=/app/storage
RUN mkdir -p /app/storage

EXPOSE 8080

CMD ["node", "server.js"]
