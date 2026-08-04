# Шатахуун ERP — API (NestJS) production дүрс.
# Railway / Fly.io / аль ч контейнер хостод ажиллана (WebSocket + Redis + Prisma бүрэн).
#
# Debian-суурьтай (alpine биш) — `argon2` нь native модуль тул musl дээр эх кодоос
# хөрвүүлэх шаардлагатай болдог; slim дээр бэлэн binary ашиглана.

# ─────────────────────────── builder ───────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Prisma-д OpenSSL шаардлагатай
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Зөвхөн манифестуудыг эхэлж хуулж давхаргын кэшийг ашиглана
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/types/package.json      packages/types/
COPY packages/schemas/package.json    packages/schemas/
COPY packages/config/package.json     packages/config/
COPY apps/api/package.json            apps/api/

# NODE_ENV=production үед pnpm нь devDependencies-ийг АЛГАСДАГ тул (nest/prisma/tsc
# бүгд dev) build-ийн үед development горимоор суулгана.
ENV NODE_ENV=development
RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/api/ apps/api/

# Дараалал чухал (§11): types → schemas → prisma client → nest build
RUN pnpm --filter @fuel/types build \
    && pnpm --filter @fuel/schemas build \
    && pnpm --filter @fuel/api exec prisma generate \
    && pnpm --filter @fuel/api build

# ─────────────────────────── runner ────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Migration-д зориулж Prisma CLI-г ТУСДАА глобалаар суулгана. (Ажиллах дүрсэд pnpm/corepack
# ашиглахгүй — root бус хэрэглэгчээр pnpm дуудахад corepack-ийн кэш саад болдог.)
# Хувилбар нь apps/api/package.json дахь prisma-тай тааруулагдсан байх ёстой.
RUN npm install -g prisma@6.19.3 && npm cache clean --force

# Ажиллахад шаардагдах зүйлс (node_modules нь prisma client-ийг агуулна)
COPY --from=builder /app/node_modules          ./node_modules
COPY --from=builder /app/packages              ./packages
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist         ./apps/api/dist
COPY --from=builder /app/apps/api/prisma       ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json          ./package.json

USER node

# PORT-ыг хостоос авна (Railway/Fly.io өөрөө өгнө), эс бөгөөс 4000
ENV PORT=4000
EXPOSE 4000

# Асахдаа migration-ыг тавьж (idempotent), дараа нь серверийг эхлүүлнэ.
CMD ["sh", "-c", "prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
