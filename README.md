# Fuel Retail System

2–10 салбартай шатахуун түгээх станцын сүлжээний **бүрэн цогц менежментийн систем**.
POS, нөөц, ажилтан/ээлж, санхүү/тайланг нэг платформ дээр нэгтгэнэ.

> Архитектур, дүрэм, конвенцийг [`CLAUDE.md`](./CLAUDE.md)-аас үзнэ үү. Энэ нь төслийн
> **эх дүрэм** — код бичихээс өмнө уншина.

---

## Технологи

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** NestJS + Prisma + PostgreSQL 16 (TimescaleDB) + Redis
- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind + TanStack Query (responsive PWA)
- **Хуваалцсан:** TypeScript types + Zod schemas (`packages/`)
- **Auth:** JWT (access+refresh, Redis rotation) + RBAC
- **Лог/Audit:** Pino (redaction) + append-only `audit_log`

---

## Шаардлага

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm` эсвэл corepack)
- Docker (Postgres, Redis, Loki)

---

## Эхлүүлэх

```bash
# 1) Хамаарал суулгах
pnpm install

# 2) Дэд бүтэц (Postgres + Redis + Loki + Grafana)
docker compose up -d

# 3) Орчны хувьсагч (аль хэдийн локалд бэлэн .env байгаа; шинээр бол:)
#    cp .env.example apps/api/.env   (DATABASE_URL, JWT secret гэх мэт)

# 4) Хуваалцсан package build (api/web эдгээрийн dist-ийг ашиглана)
pnpm --filter @fuel/types build && pnpm --filter @fuel/schemas build

# 5) DB migration + seed (грейд, role, demo салбар, admin хэрэглэгч)
pnpm --filter @fuel/api prisma migrate dev
pnpm --filter @fuel/api prisma db seed

# 6) Хөгжүүлэлт (web + api зэрэг)
pnpm dev
```

- API: <http://localhost:4000/api> (health: `/api/health`)
- Web: <http://localhost:3000>
- Demo нэвтрэх: **admin / admin123** (seed)

---

## Бүтэц

```
apps/
  api/    # NestJS backend (modules: auth, audit, stations, pos, inventory, staff, finance, sync, health)
  web/    # Next.js 15 PWA
packages/
  types/    # хуваалцсан TS type/enum + мөнгөний branded type
  schemas/  # Zod схем + formatMnt/parseMnt + НӨАТ туслахууд
  config/   # eslint / tailwind preset
```

---

## Командууд

| Команд | Үйлдэл |
|--------|--------|
| `pnpm dev` | web + api зэрэг (turbo) |
| `pnpm build` | бүгдийг build |
| `pnpm typecheck` | бүх багц typecheck |
| `pnpm test` | unit/integration тест |
| `pnpm --filter @fuel/api prisma studio` | DB GUI |

---

## Хийгдсэн (Foundation)

- ✅ Monorepo суурь (pnpm + turbo), хуваалцсан types/schemas
- ✅ Бүрэн Prisma домэйн схем (§6) — мөнгө BigInt, stationId scope, soft-delete, UTC
- ✅ NestJS core: config(Zod env), Prisma, Redis, Pino(redaction), global error filter
- ✅ Auth: JWT access+refresh (Redis rotation), RBAC guard, argon2
- ✅ Audit: append-only service + interceptor (§8)
- ✅ Stations модуль (station-scoped — §10 жишээ)
- ✅ **POS борлуулалт** — sale (transaction + audit + idempotency + нөөц хорогдол), void, refund (cumulative cap, partial)
- ✅ **Ээлж нээх/хаах** — бэлэн мөнгөний тооцоо (буцаалт хассан), нэг нээлттэй ээлж (partial unique index)
- ✅ Түлшний үнэ (PricingService), POS каталог
- ✅ **Нөөц / Агуулах** (§7.2): бараа/нийлүүлэгч, нийлүүлэлт хүлээн авах, нөөцийн засвар (reason+actor), резервуарын тооцоо нийлэх, салбар хооронд шилжүүлэг (хүрэлцээ шалгах), нөөц бага alert, StockMovement ledger
- ✅ **Санхүү / Тайлан** (§7.4): өдрийн тайлан (салбар+нэгдсэн), төлбөр/грейдээр задаргаа, НӨАТ, KPI самбар, грейдийн маржин, аномали илрүүлэлт, CSV экспорт
- ✅ **Realtime (Socket.IO §4)**: JWT gateway, станц/компани room scoping, sale/shift/inventory эвент; web `useRealtime` hook + POS live статус
- ✅ **Offline-first (§9)**: IndexedDB дараалал (active + dead/conflict), idempotent sync push/pull, авто-flush, double-submit lock, network-first SW
- ✅ **Admin panel**: салбар CRUD, ажилтан бүртгэл (role+салбар+нэвтрэх данс argon2), role→permission тохиргоо — web `/admin`
- ✅ **Харилцагч / Зээл / Авлага**: компани-хэмжээний харилцагч, зээлийн борлуулалт (лимит хяналт), авлага барагдуулах төлбөр, гар засвар, running-balance дэвтэр (FOR UPDATE lock), void/refund-д авлага атомик буцаах, авлага/өглөгийн тайлан — web `/customers`
- ✅ **POS сайжруулалт**: зээлийн харилцагчийг нэр/утсаар хайх; түлшийг **литрээр ЭСВЭЛ мөнгөн дүнгээр** авах (литр = дүн/үнэ сервер дээр, дүн яг тэр); каталог **Түлш / Бараа материал** таб, материал ангиллаар (Масло, Тосол); ижил бараа дарахад тоо нэмэгдэх
- ✅ **Split payment / олон хэлбэрийн төлбөр**: нэг борлуулалтыг бэлэн+карт+зээл г.м. хувааж төлөх (дутуу/илүү/тэнцсэн live, дүн заавал тэнцэнэ); бэлэн **хариулт** UI-д тооцоод харуулна; картын masked PAN/зөвшөөрлийн код; **RefundLine** — буцаалт хэлбэр бүрээр, төлсөн дүнгээр хязгаарлагдана (бэлэн касс хэт татагдахгүй); finance-д зээл/бодит цуглуулсан ялгаатай; reference §2.5 PAN-redaction
- ✅ **Бараа материалын модуль** (`/materials`): бараа нэмэх/засах/устгах (soft-delete), **барааны бүлэг** (ProductGroup) CRUD, идэвхтэй/идэвхгүй; талбарууд — код, нэр, **зураг (файл/камер → data URL)**, **баркод (камер ZXing scan)**, нэгж үнэ, НӨАТ, **нийлүүлэгч**; POS каталог бүлгийн нэрээр бүлэглэгдэнэ
- ✅ **POS толгойд салбар + кассир** (`/auth/me` → нэр, хандах салбарууд)
- ✅ **Админ — салбар + резервуар**: салбар бүрийн доторх резервуар (FuelTank) нэмэх/засах/устгах (код, грейд, багтаамж, доод босго, идэвх); түвшинг нөөцийн ledger-ээр (§7.2)
- ✅ **Админ — ажилтан**: овог/нэр/утас/хаяг/салбар/тухайн салбарын эрх/нэвтрэх/нууц заавал; идэвхтэй↔идэвхгүй; нэвтрэх нууц үг шууд reset; засах; жагсаалт нь баганаар + хайлт/филтер; "Шинэ ажилтан" модал
- ✅ **Хяналтын самбар** (`/control`): салбар бүрийн төлөв, идэвхтэй ээлжийн ажилтан, өдрийн орлого (хэлбэрээр); **ээлж нээх/хаах хүсэлт батлах/татгалзах** (нягтлан/админ)
- ✅ **Ээлжийн батлах урсгал** (§7.3): кассчин **ээлж эхлүүлэх хүсэлт** (савны түлш см+зураг) → нягтлан/админ батлах → идэвхтэй; **хаах хүсэлт** (тоолсон бэлэн + хэлбэрээр тушаалт vs тооцоо + савны см+зураг) → батлах → хаагдана. Нэг салбарт нэг л идэвхтэй ээлж (DB partial unique); идэвхтэй ээлжтэй үед өөр ажилтан POS/ээлж хүлээх боломжгүй; **TRANSFER (Шилжүүлэг)** төлбөр нэмсэн
- ✅ **Apple-style дизайн**: системийн фонт стек (SF Pro/Segoe UI), системийн цэнхэр (#007AFF), цайвар саарал canvas + цагаан карт, илүү дугуй булан — global token-оор бүх хуудсанд
- ✅ Next.js PWA: dashboard, login, **POS / Нөөц / Санхүү** дэлгэц, manifest, service worker
- ✅ Мөнгө/НӨАТ/тоо хэмжээ unit тест (20)
- ✅ DB hardening: audit append-only trigger (UPDATE/DELETE/TRUNCATE), partial unique index-үүд (нэг нээлттэй ээлж)

## Дараагийн алхам

1. И-баримт интеграц — **official posapi спецээр** (§12, эндпойнт зохиохгүй).
2. API integration тест (Testcontainers) + E2E (Playwright): борлуулалт, ээлж, нөөц, тайлан, offline sync.
3. RefundLine (буцаалтын мөр) — грейд/НӨАТ-ыг буцаалтаар нарийн цэвэрлэх тайланд.
4. Offline ээлж-хаалт зөрчлийг авто-зохицуулах (одоо dead дараалалд гар аргаар); SW precache бэхжүүлэлт.
5. (Сонголт) Нөөцийн >=0 DB CHECK ба POS-ийн оверселл бодлогыг §1-тэй уялдуулан эцэслэх.
