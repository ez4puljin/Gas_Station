# CLAUDE.md

> Код бичихээс **өмнө унш**, доорх дүрмийг чанд баримтал. Дэлгэрэнгүй түүх auto-memory (MEMORY.md)-д.

## 1. Төсөл
**`fuel-retail-system`** — 2–10 салбартай шатахуун станцын сүлжээний менежмент. 4 модуль:
**POS/борлуулалт · нөөц/агуулах · ажилтан/ээлж · санхүү/тайлан**.
Шаардлага: тогтвортой+хурдан, responsive PWA (утас/таблет/PC), бүх үйлдэл логтой, олон салбар
(`stationId`-аар тусгаарлал), **offline-first POS**.

## 2. Зөрчиж болохгүй (Non-negotiables)
1. **Мөнгө = integer MNT** (float биш). Format `1,500 ₮`.
2. **Бүх query `stationId`-аар scope.** Эрхгүй салбарт хандахгүй.
3. **Санхүүгийн үйлдэл transaction дотор** (атомик).
4. **Audit log append-only** — UPDATE/DELETE хэзээ ч үгүй.
5. **Эмзэг дата (нууц үг/токен/PAN/PIN) логлохгүй**; карт зөвхөн `****1234`.
6. **Soft-delete** (`deletedAt`); бодит устгал зөвхөн migration.
7. **Adjustment бүрд `reason` + `actorId` заавал.**
8. **Цаг UTC-д хадгал, `Asia/Ulaanbaatar`-аар харуул.**

## 3. Стек
TS strict · **pnpm + Turborepo** monorepo · **Next.js 15 (App Router) + React 19 + Tailwind** (web PWA) ·
**NestJS + Prisma + PostgreSQL** (api) · Redis (session/cache/throttle) · Socket.IO (realtime) ·
JWT+RBAC · **Zod** (front/back хуваалцсан) · Pino лог · Service Worker+IndexedDB (offline).
TanStack Query тохируулсан (`lib/query-client.ts`).
> Шинэ dependency нэмэхээс **өмнө асуу.** Стекийг шалтгаангүй солихгүй.

## 4. Бүтэц
```
apps/web   — Next.js (app/<module>, components, lib)
apps/api   — NestJS (src/modules/<domain>, src/common, prisma)
packages/  — types · schemas (Zod) · config
```
Modular monolith · shared DB + row-level `stationId` scoping. Домэйн = `apps/api/prisma/schema.prisma`.

## 5. Командууд
```
pnpm install      pnpm dev      # web+api (turbo)
pnpm build  typecheck  lint  test
pnpm db:generate  pnpm db:seed
pnpm --filter @fuel/api exec prisma migrate deploy
pnpm --filter @fuel/schemas exec vitest run src/money.test.ts   # ганц тест
```
Локал: **`install.bat`** (бүрэн автомат нэг удаагийн setup: Node/pnpm шалгаж суулгах · env · install/build ·
Postgres role/db · **Redis суулгаж асаах** · `migrate deploy` · `db:seed`) → **`start.bat`** (Postgres+Redis шалгаад dev).
Хоёулаа `%~dp0`-оос ажиллана (өөр PC-д зам ялгаатай тул hardcode үгүй).

## 6. Конвенц
- TS strict, `any` үгүй. Нэршил: type `PascalCase`, func `camelCase`, файл `kebab-case`, DB `snake_case` (`@map`).
- API орц/гарц **Zod** (`packages/schemas`-аас infer). Логик service-д, controller нимгэн. Алдаа = typed exception
  + global filter, хэрэглэгчид Монгол мессеж.
- **Мөнгө:** `formatMnt`/`parseMnt`/`lineTotalMnt`/`splitVatFromGross` ашигла. **Тоо хэмжээ = milli**
  (`toMilliUnits`/`milliToDecimalString`) — **JS float хэрэглэхгүй** (UI-д ч).
- Дараалал: **schema → migration → service → controller → UI**. Эргэлзвэл асуу (schema/мөнгө/И-баримт/dependency/устгал).
- Commit: Conventional Commits.

## 7. Монгол тал
MNT integer (₮) · НӨАТ 10% · UI default Монгол · UB timezone (DB UTC) · грейд АИ-80/92/95/ДТ ·
**И-баримт хэрэгжээгүй** (official `posapi` спец хэрэгтэй — endpoint/формат өөрөө зохиохгүй).

## 8. Лог / аудит / аюулгүй байдал
- Pino JSON + `correlationId`; **redact** `password/token/pan/cvv/pin/authorization`.
- `audit_log` **append-only** (DB trigger UPDATE/DELETE/TRUNCATE хориглодог), interceptor-оор автоматаар:
  борлуулалт/буцаалт/цуцлалт/үнэ/нөөц/ээлж/эрх/нэвтрэлт.
- Auth: JWT (access богино + refresh Redis-д rotation, logout=цуцлах), **argon2**, RBAC `@Roles` guard,
  Redis rate-limit. Бүх input Zod. `.env` git-д **орохгүй**. Зөвхөн Prisma/parameterized (raw concat үгүй).

---

## 9. Хэрэгжсэн төлөв
Бэлэн: Core (Zod env, Prisma, Redis, Pino, error filter, RBAC, audit, throttle) · Auth (JWT+refresh, argon2,
`GET /auth/me`→нэр+салбарууд) · **POS** (transaction+audit+idempotency; **split payment** CASH/CARD/FUEL_CARD/
MOBILE/TRANSFER/CREDIT; void; **мөр-түвшний refund**+нөөц сэргээх) · нөөц/агуулах · **харилцагч/зээл/авлага** ·
**худалдан авалт** (`procurement`: нэг нийлүүлэгчээс олон салбар/сав/бараа руу мөрөөр хуваарилж **PENDING→RECEIVED**;
авахад сав/нөөц↑ + FuelDelivery/StockMovement + нийлүүлэгчийн **өглөг (AP) ledger**↑) · **нийлүүлэгчийн өглөг** (төлбөр/засвар/хуулга) ·
**admin** (салбар/ажилтан/role CRUD) · бараа материал (бүлэг/нийлүүлэгч; зураг=dataURL; баркод scan `@zxing`) ·
**ээлж хүсэлт→батлах** урсгал (PENDING_OPEN→OPEN→PENDING_CLOSE→CLOSED) · realtime (Socket.IO) · offline-first
(IndexedDB + idempotent sync) · **тайлан 10+** (хэвлэх + client-side `.xlsx`).
Web: бүх хуудас `'use client'`; бүрхүүл `components/app-shell.tsx` (тогтмол sidebar + topbar); брэнд **"Шатахуун ERP"**.
**Хэрэгжээгүй (зориуд):** И-баримт · BullMQ jobs · E2E тест · цалин.

## 10. Локал орчин
- **Локал PostgreSQL** (docker биш): апп DB **:5432** (машинаас хамаараад PG17/PG18; олон instance байж
  болзошгүй — PG16 нь :5433 г.м тул install.bat нь role/db-г `-p 5432`-д тулгаж үүсгэнэ). superuser
  `postgres/postgres`, апп `fuel/fuel` @ `fuel`. TimescaleDB байхгүй → `tank_reading` энгийн хүснэгт.
- **Redis (:6379)** = Memurai **эсвэл** портабл Redis (tporadowski v5.0.14.1) — Memurai суугаагүй бол
  install.bat нь `tools/redis/` (gitignore-д) рүү татаж асаана. Redis-гүйгээр login/refresh/throttle ажиллахгүй.
- Env: `apps/api/.env` (API+Prisma), `apps/web/.env.local` (NEXT_PUBLIC_*) — `.env.example`-ээс.
- Seed: **`admin`/`admin123`** (idempotent). Салбарын код **C1, C2…**; saleNumber = `C1-YYYY/MM/DD-0001`.

## 11. Build дараалал (чухал)
- `@fuel/types`/`@fuel/schemas` → **dist** болж compile-дна; api/web dist хэрэглэнэ (Turbo `^build`).
  Тиймээс typecheck/build-ийн **өмнө багцуудыг build** + `db:generate`.
- `nest build` нь `@fuel/schemas`-ийг **bundle** хийдэг — schemas эх өөрчилбөл api-г **дахин build**.
- `apps/api` tsconfig **`incremental: false`** (БҮҮ асаа). `apps/web/.next` "Cannot find module" хуурамч → `rm -rf apps/web/.next`.

## 12. Анхаарах (as-built gotchas)
- **Мөнгө/тоо:** BigInt → JSON **string** (`main.ts`-д `BigInt.prototype.toJSON`); тооцоог `@fuel/schemas` helper-ээр л.
- **Station scoping:** service бүр `assertStationAccess(prisma,user,stationId)`. `allStations` = өөрийн компанийн бүх салбар.
- **Нөөц сөрөг болж болно** (sale/adjust зориуд; зөвхөн TRANSFER хатуу шалгана). Зөрүү → тооцоо нийлэх + alert + audit.
- **Realtime emit transaction commit-ийн ДАРАА** (gateway try/catch, throw үгүй). **Offline sync** idempotent
  (`clientGeneratedId`); terminal алдаа → dead queue.
- **Зураг = data URL** (canvas ~600px JPEG, DB-д inline); камер/scan-д HTTPS (localhost OK).
- **PostgreSQL enum:** `ADD VALUE` ба ашиглалтыг **ТУСДАА migration-д** (нэг transaction дотор болохгүй).
- **Partial unique** (schema-д `@@index`, raw SQL migration-д unique): нэг салбарт нэг идэвхтэй ээлж
  (`shift WHERE status<>CLOSED`), идэвхтэй савны код (`fuel_tank WHERE deleted_at IS NULL`) →
  **seed-д upsert биш `findFirst`+`create`.**
- **`prisma migrate reset` БЛОКЛОГДДОГ** (agent guard). Migration SQL засвал checksum гараар тааруул;
  шинэ DB-д `DATABASE_URL=…fuel_migtest prisma migrate deploy`-оор шалга.
- **Ээлж (separation of duties):** өөрийн хүсэлтийг батлахгүй (owner/admin override); approve/reject = ACCOUNTANT.
  Савны `tankId` ээлжийн салбарт харьяалагдахыг шалга.
- **Refund инвариант:** `RefundItem` мөр бүр нөөц сэргээнэ, НӨАТ пропорциональ (мөрийн үлдэгдлээс хэтрэхгүй).
  Түлш буцаахад сав = ЭХ sale-ийн StockMovement-аас грейдээр. Refund/void = `FOR UPDATE`; буцаалттай sale-ийг void
  хийхгүй; буцаалт бүр нээлттэй ээлж шаардана.
- **salesReport нийт:** DB aggregate-аар БҮХ мөрөөр (per-sale `items` л 5000-аар таслагдана). Accumulator-аар нийт бодохгүй.
- **AR/AP ledger:** эхний = мужийн өмнөх сүүлчийн `balanceAfterMnt`; эцсийн = эхний+дебет−кредит.
- **UI бүрхүүл / өргөн:** AppShell контент `flex flex-col` тул `mx-auto max-w-…` нь `w-full`-гүй бол өргөн
  дэлгэцэнд агшиж голддог. **Бүх хуудасны `<main>` заавал `w-full`.** Конвенц: апп/модул хуудас =
  `mx-auto w-full max-w-[1700px]` (дэлгэц дүүргэнэ); **тайлан** (`/reports/*`) = `mx-auto w-full max-w-6xl`.
- **Модал = `Portal`** (`components/portal.tsx` → `document.body`): `<main>`-ийн `fadeUp` animation containing
  block үүсгэдэг тул `fixed inset-0` модал төвлөрөхгүй/хагас blur болдог. **Шинэ модал заавал `<Portal>`-оор**;
  форм модалд backdrop-close үгүй (оролт алдахаас).
- **Резервуар gauge** (`components/liquid-tank.tsx`): түвшин %-аар + SVG долгион; өнгийг систем бодно —
  min-ээс доош/<10% улаан, <25% шар, <55% цэнхэр, бусад ногоон.
- **Гүйцэтгэл:** `lib/request-cache.ts` (`cachedFetch`/`invalidateCache`, TTL 60с, in-flight dedup) —
  `posApi.stations()` кэштэй (auth-д цэвэрлэх, station CRUD-д invalidate). `listSales` мөр тоолоход
  **`_count`** (бүх line ачаалахгүй); `getSale` бүтэн line-тэй.
- **Тайлан:** Excel = client-side exceljs (`lib/export-xlsx.ts`, динамик import); хэвлэх = `window.print()` +
  `.no-print`/`.print-area`. Шинэ тайлан = `<PrintableReport/>` + `reportsApi`.
- **Тооцооны дэвтэр (AR/AP):** `components/account-ledger-report.tsx` — нягтлан хэлбэр (Эхний/Гүйлгээ/Эцсийн × Дебет/Кредит,
  дансны кодгүй). `nature='debit'`=авлага (харилцагч), `'credit'`=өглөг (нийлүүлэгч) — багана **swap**-аар буулгана.
  Гүйлгээ дээр **double-click** → доторх бараа (`ledger().entries[].items`). Нийлүүлэгчийн RECEIPT-ийг яг тухайн мөртэй
  холбохын тулд `SupplierTransaction.purchaseLineId` (receiveLine-д бичнэ; хуучин гүйлгээнд null → бараагүй).

## 13. Claude workflow
Эхлээд унш → жижиг шалгаж болох алхмаар → **schema→migration→service→controller→UI** → type/schema `packages`-д →
эгзэгтэйд audit+transaction → **эргэлзвэл асуу** → юу хийснээ товч тайлбарла.
Эгзэгтэй (мөнгө/нөөц/audit/ээлж/auth) логикт **adversarial review** хийхийг зөвлөнө.

---
_Төсөл хөгжихөд шинэчилнэ._
