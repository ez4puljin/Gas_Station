# CLAUDE.md

> Энэ файл нь **Claude Code**-д энэ төслийн контекст, дүрэм, конвенцийг өгнө.
> Код бичих, файл засах, шинэ модуль нэмэх бүрд эхлээд энэ файлыг уншиж, доорх
> зарчмуудыг чанд баримтал.

---

## 1. Төслийн тойм (Project Overview)

**Нэр:** `fuel-retail-system` (ажлын нэр)

**Зорилго:** 2–10 салбартай шатахуун түгээх станцын сүлжээнд зориулсан **бүрэн цогц
менежментийн систем**. Дараах 4 үндсэн модулийг нэг платформ дээр нэгтгэнэ:

1. **POS / Түлш борлуулалт** — кассын систем, түлш ба дэлгүүрийн бараа борлуулалт
2. **Нөөц / Агуулахын менежмент** — резервуар, бараа, нийлүүлэлт, тооллого
3. **Ажилтан / Ээлжийн хуваарь** — ажилтан, эрх, ээлж нээх/хаах, тооцоо нийлэх
4. **Санхүү / Тайлан / Аналитик** — өдрийн тайлан, нэгтгэл, KPI самбар

**Гол шаардлага (хатуу):**
- ⚙️ **Тогтвортой, өндөр гүйцэтгэлтэй** — мөнгө, нөөцтэй ажилладаг тул найдвартай байх нь нэн тэргүүнд.
- 📱💻 **Бүх төхөөрөмж дээр зэрэг ажилладаг** — гар утас, таблет, PC дээр нэг кодоор (responsive PWA).
- 📋 **Бүх үйлдэл логлогддог** — application log + audit trail бүрэн хадгалагдана.
- 🌐 **Олон салбар** — өгөгдөл салбар тус бүрээр тусгаарлагдаж, төв нэгтгэл хийгдэнэ.
- 🔌 **Интернэт тасарсан ч ажилладаг POS** — offline-first, дараа нь sync.

---

## 2. Зөрчиж болохгүй зарчмууд (Non-negotiables)

Claude эдгээрийг **хэзээ ч** зөрчихгүй. Эргэлзвэл энд буцаж ир.

1. **Мөнгийг integer-ээр хадгал.** Бүх дүн `MNT` (төгрөг) дотор бүхэл тоо. Float ашиглахгүй
   (`amount_mnt: number`-ийг бүхэл утгаар). Монгол төгрөгт мөнгө практикт хэрэглэгддэггүй.
2. **Бүх query-г `stationId`-ээр scope хий.** Хэрэглэгчийн эрхгүй өөр салбарын өгөгдөлд
   хандах ёсгүй. Default-аар салбараар шүү.
3. **Санхүүгийн үйлдлийг transaction дотор гүйцэт.** Борлуулалт, тооцоо нийлэх, нөөц хорогдуулах
   зэрэг нь атомик (DB transaction) байх ёстой.
4. **Audit log нь append-only.** `audit_log`-ийг хэзээ ч `UPDATE`/`DELETE` хийхгүй. Зөвхөн нэмнэ.
5. **Эмзэг өгөгдлийг ил логлохгүй.** Картын дугаар, нууц үг, токен, PIN-ийг лог/хариунд бичихгүй.
   Картын дугаарыг зөвхөн masked (`****1234`) хэлбэрээр.
6. **Устгахгүй, soft-delete хий.** Гүйлгээ, бараа, ажилтан зэргийг `deletedAt`-аар тэмдэглэ.
   Бодит устгал зөвхөн админ migration-аар.
7. **Бэлэн мөнгө/нөөцийн засварыг үндэслэлтэй хий.** Бүх adjustment-д шалтгаан (`reason`) +
   хэн хийсэн (`actorId`) заавал.
8. **Цаг бүхэлдээ UTC-аар хадгал.** Дэлгэцэнд `Asia/Ulaanbaatar` (UTC+8)-аар хөрвүүл.

---

## 3. Технологийн стек (Tech Stack)

Сонгосон шалтгаан: нэг хэл (TypeScript) бүх давхаргад → тогтвортой, дахин ашиглагдах type;
PWA → нэг кодоор бүх төхөөрөмж; PostgreSQL → мөнгө/нөөцийн ACID найдвартай байдал.

| Давхарга | Технологи | Шалтгаан |
|----------|-----------|----------|
| **Хэл** | TypeScript (strict) | Бүх давхаргад нэг хэл, type-safe |
| **Monorepo** | pnpm workspaces + Turborepo | Хуваалцсан код/type, нэгдсэн build |
| **Frontend** | Next.js 15 (App Router) + React 19 | Responsive PWA, SSR, бүх төхөөрөмж дээр |
| **UI** | Tailwind CSS + shadcn/ui | Touch-friendly, хүртээмжтэй, тогтвортой |
| **Client state** | TanStack Query + Zustand | Сервер state + локал state |
| **Backend** | NestJS (TypeScript) | Модульчлагдсан, тогтвортой, DI/guard/interceptor |
| **API** | REST (+ WebSocket for realtime) | Тодорхой, кэшлэгддэг; зэрэгцээ realtime |
| **DB** | PostgreSQL 16 (+ TimescaleDB) | ACID; time-series (резервуарын түвшин, тоолуур) |
| **ORM** | Prisma | Type-safe, migration сайн (өндөр гүйцэтгэл хэрэгтэй query-д Drizzle/raw SQL) |
| **Cache / Session** | Redis | Сесс, кэш, rate-limit |
| **Queue / Jobs** | BullMQ (Redis) | Тайлан, өдрийн нэгтгэл, салбар sync |
| **Realtime** | Socket.IO | Самбар, POS sync, alert (нөөц бага, үнэ солигдсон) |
| **Auth** | JWT (access+refresh) + RBAC | Эрхийн түвшин салбар тус бүрээр |
| **Validation** | Zod (front/back хуваалцсан схем) | Нэг эх сурвалжаас баталгаажуулалт |
| **Logging** | Pino → Grafana Loki | Бүтэцлэгдсэн JSON лог, төвлөрсөн хадгалалт |
| **Monitoring** | OpenTelemetry + Prometheus + Sentry | Trace, metric, алдааны хяналт |
| **Offline** | Service Worker + IndexedDB | POS интернэтгүй ажиллаж, дараа нь sync |
| **i18n** | next-intl | Монгол (үндсэн) + Англи |
| **Deploy** | Docker + docker-compose, GitHub Actions | Тогтвортой нийлүүлэлт, CI/CD |

> **Анхаар:** Шинэ dependency нэмэхээс өмнө асуу. Стекийг шалтгаангүйгээр солихгүй.

---

## 4. Архитектур (Architecture)

**Загвар: Modular Monolith** (микросервис биш). 2–10 салбарт энэ нь хамгийн тогтвортой бөгөөд
ажиллахад хялбар. Хэрэгцээ ургавал хожим тусгаарлаж болно.

```
┌─────────────────────────────────────────────────────────────┐
│  Салбар бүрийн төхөөрөмжүүд (PWA: касс, таблет, утас, PC)      │
│  • Offline кэш (IndexedDB) • Service Worker • Realtime (WS)    │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS / WSS
┌───────────────▼─────────────────────────────────────────────┐
│  Backend (NestJS) — модуль тус бүр домэйн                     │
│  pos │ inventory │ staff │ finance │ auth │ audit │ sync      │
│  ── Guard (RBAC) ── Interceptor (logging/audit) ── Pipe (Zod) │
└──────┬──────────────┬───────────────┬──────────────┬─────────┘
       │              │               │              │
   PostgreSQL      Redis           BullMQ         Loki/OTel
  (+TimescaleDB)  (cache/sess)   (jobs/sync)    (log/trace)
```

**Multi-tenancy загвар:** Нэг компанийн 2–10 салбар тул **shared database + `stationId` scoping**
(row-level). Тусдаа DB-нд хуваахгүй. Бүх салбарын өгөгдөл нэг DB-д, тайланд нэгтгэгдэнэ.

**Realtime:** Самбар, нөөц/үнийн alert, ээлжийн төлөв нь Socket.IO-гоор шууд шинэчлэгдэнэ.

---

## 5. Monorepo бүтэц (Directory Structure)

```
fuel-retail-system/
├── apps/
│   ├── web/                  # Next.js 15 PWA (бүх төхөөрөмжийн UI)
│   │   ├── app/              # App Router (модулиар: pos, inventory, staff, finance)
│   │   ├── components/       # shadcn/ui дээр суурилсан компонент
│   │   ├── lib/              # client utils, offline sync, query client
│   │   └── public/           # PWA manifest, service worker
│   └── api/                  # NestJS backend
│       └── src/
│           ├── modules/
│           │   ├── pos/
│           │   ├── inventory/
│           │   ├── staff/
│           │   ├── finance/
│           │   ├── auth/
│           │   ├── audit/
│           │   └── sync/      # offline → төв sync
│           ├── common/        # guards, interceptors, filters, pipes
│           └── prisma/        # schema.prisma, migrations, seed
├── packages/
│   ├── types/                # хуваалцсан TypeScript type/DTO
│   ├── schemas/              # Zod схемүүд (front/back хуваалцсан)
│   ├── config/               # eslint, tsconfig, tailwind preset
│   └── ui/                   # дахин ашиглагдах UI primitive (заавал биш)
├── docker-compose.yml        # postgres, redis, loki, app
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md
```

---

## 6. Домэйн загвар (Domain Model)

Гол entity-үүд. Бүгд `id` (cuid/uuid), `createdAt`, `updatedAt`, `deletedAt?`-тэй.
Салбар-хамааралтай entity-д `stationId` заавал.

**Байгууллага ба салбар**
- `Company` — толгой компани, тохиргоо, татварын мэдээлэл
- `Station` — салбар: байршил, код, цагийн бүс, идэвхтэй эсэх

**Түлш ба тоног төхөөрөмж**
- `FuelGrade` — түлшний төрөл (АИ-80, АИ-92, АИ-95, ДТ/дизель)
- `FuelTank` — салбарын резервуар: грейд, багтаамж, одоогийн түвшин
- `Pump` (Dispenser) — түгээгүүр баганa
- `Nozzle` — хошуу: pump + tank + grade-тэй холбоотой, тоолуурын утга
- `TankReading` — резервуарын түвшний цаг хугацааны бичлэг (TimescaleDB)

**Бараа ба нөөц**
- `Product` — дэлгүүрийн бараа (хүнс, тос гэх мэт)
- `StockLevel` — салбар × бараа-ны үлдэгдэл
- `StockMovement` — нөөцийн хөдөлгөөн: receipt | sale | adjustment | transfer | loss
- `Supplier` — нийлүүлэгч
- `FuelDelivery` — түлшний нийлүүлэлт (хүлээн авалт, хэмжээ, баримт)

**Борлуулалт**
- `Sale` (Transaction) — толгой: салбар, ээлж, кассчин, нийт дүн, төлбөрийн төрөл
- `SaleLine` — мөр: түлш/бараа, тоо, нэгж үнэ, дүн
- `Payment` — cash | card | fuelCard | mobile (masked мэдээлэл)
- `FuelPrice` — грейд × салбар-ын үнэ, **түүхтэй** (effectiveFrom/To)
- `Refund` / `Void` — буцаалт/цуцлалт (audit-тай)

**Ажилтан ба ээлж**
- `Employee` — ажилтан, холбоо барих, статус
- `Role` / `Permission` — RBAC (cashier, shift_supervisor, station_manager, accountant, admin, owner)
- `Shift` — ээлж: нээх/хаах цаг, эхлэх/төгсөх бэлэн мөнгө, тоолуурын утга, кассчид
- `CashReconciliation` — ээлжийн бэлэн мөнгөний тооцоо (тооцоолсон vs бодит, зөрүү)
- `Attendance` — ирц/цаг бүртгэл (заавал биш)

**Систем**
- `User` — нэвтрэх данс (Employee-тэй холбоотой), нууц үг hash
- `AuditLog` — append-only аудитын бичлэг
- `SyncQueueItem` — offline үед үүссэн, sync хүлээж буй үйлдэл

---

## 7. Модулиуд (Modules)

### 7.1 POS / Түлш борлуулалт
- Түлшийг дүн/литрээр, дэлгүүрийн барааг борлуулна
- Түгээгүүр/хошуутай холбогдох (тоолуур уншилт), prepay/postpay горим
- Олон төлбөр: бэлэн, карт, түлшний карт, мобайл
- Баримт хэвлэх / e-receipt (→ **И-баримт**, §12 үз)
- **Offline-first:** интернэт тасарсан ч борлуулалт үргэлжилнэ, дараа нь sync
- Борлуулалт бүр **нээлттэй ээлж + кассчинтай** заавал холбоотой
- Буцаалт/цуцлалт — шалтгаан + зөвшөөрөлтэй, audit-д бичигдэнэ

### 7.2 Нөөц / Агуулахын менежмент
- Резервуарын түвшин (гар + ATG/мэдрэгч интеграц), тооцоо нийлэх (дэвтэр vs бодит, хорогдол/зөрүү)
- Дэлгүүрийн барааны үлдэгдэл
- Түлшний нийлүүлэлт хүлээн авах, нийлүүлэгчийн удирдлага
- Салбар хооронд нөөц шилжүүлэх
- Нөөц бага үед alert, дахин захиалга
- Бүх хөдөлгөөнийг `StockMovement` ledger-т бүртгэх (мөрдөгдөх чадвар)

### 7.3 Ажилтан / Ээлжийн хуваарь
- Ажилтны бүртгэл, эрх/role
- Ээлжийн хуваарь, тооцоо
- Ээлж нээх/хаах: бэлэн мөнгөний тооцоо, тоолуурын утга бүртгэх
- Ирц/цаг бүртгэл
- Кассчин тус бүрийн борлуулалтын гүйцэтгэл
- Цалингийн оролт (цаг) — заавал биш

### 7.4 Санхүү / Тайлан / Аналитик
- Салбар тус бүр ба нэгдсэн өдрийн борлуулалтын тайлан
- Грейдээр түлшний борлуулалт, маржин, хорогдол
- Өдрийн эцсийн тооцоо (бэлэн, карт, түлшний хэмжээ)
- НӨАТ-ын тооцоо (Монгол: 10%), **И-баримт** нэгтгэл
- Real-time KPI самбар (салбар хооронд харьцуулалт)
- Экспорт (PDF / Excel)
- Аномали илрүүлэлт (хорогдол, зөрүү, сэжигтэй буцаалт)

---

## 8. Лог ба аудит (Logging & Audit) — ЗААВАЛ

Энэ нь төслийн **гол шаардлага**. "Бүх лог хадгалагдана."

**Application log (Pino → Loki):**
- Бүтэцлэгдсэн JSON. Бүх хүсэлтэд `correlationId`.
- Түвшин: `error | warn | info | debug`. Production-д `info`+.
- **Эмзэг талбарыг redact хий:** `password`, `token`, `pan`, `cvv`, `pin`, `authorization`.

**Audit trail (`audit_log` хүснэгт — append-only):**
- Дараах эгзэгтэй үйлдэл бүрийг бичнэ:
  - Борлуулалт, буцаалт, цуцлалт
  - Үнийн өөрчлөлт
  - Нөөцийн засвар (adjustment), нийлүүлэлт, шилжүүлэг
  - Ээлж нээх/хаах, бэлэн мөнгөний тооцоо
  - Ажилтан/эрхийн өөрчлөлт, нэвтрэлт/гаралт
- Бичлэг бүрд: `actorId`, `action`, `entity`, `entityId`, `before`, `after`, `stationId`, `ip`, `at`.
- **Хэзээ ч UPDATE/DELETE хийхгүй.** NestJS interceptor-оор автоматаар бич.

**Monitoring:** OpenTelemetry trace, Prometheus metric, Sentry алдаа.

---

## 9. Offline-first POS

Шатахуун станц интернэтгүй ч борлуулалтаа зогсоож болохгүй.

- Service Worker + IndexedDB-д борлуулалт/үйлдлийг локал дараалалд хадгал.
- Холбогдмогц `sync` модуль дарааллыг төв рүү илгээж нэгтгэнэ.
- **Idempotency:** үйлдэл бүрд `clientGeneratedId` → давхар sync-ийг хорино.
- Зөрчил шийдвэрлэх: server timestamp + last-write-wins, мөнгөн зөрүүг audit-д тэмдэглэ.
- Үнийн жагсаалт, бараа, ажилтны мэдээллийг локал кэшэд урьдчилан байршуул.

---

## 10. Multi-station дүрэм

- **Бүх query salbar-аар scope-той.** Repository/service давхаргад `stationId` шүүлт default.
- Хэрэглэгч зөвхөн эрхтэй салбар(ууд)-аа хардаг. `owner`/`admin` бүх салбар.
- Тайлан 2 түвшинд: салбарын + компанийн нэгдсэн (aggregate).
- Салбар хоорондын нөөц шилжүүлэг 2 талын `StockMovement` (гарсан/орсон) үүсгэнэ.
- Үнэ, тохиргоог салбараар тусгайлан тохируулж болно (default компанийн түвшнээс удамшина).

---

## 11. Аюулгүй байдал (Security)

- Auth: JWT (access богино, refresh урт) + Redis-д refresh хадгал. Логаут = refresh цуцлах.
- RBAC: route бүр шаардлагатай permission-той. NestJS `@Roles()` guard.
- Нууц үг: `argon2` hash. Хэзээ ч ил хадгалахгүй/логлохгүй.
- Бүх input-ийг Zod-оор баталгаажуул (front ба back хоёуланд).
- Rate limiting (Redis) — нэвтрэх, эмзэг endpoint дээр.
- Картын/төлбөрийн мэдээллийг ил хадгалахгүй, masked-аар.
- HTTPS/WSS заавал. Secret-ийг env-д (`.env` git-д орохгүй).
- SQL injection: зөвхөн Prisma/parameterized query.

---

## 12. Монголд тохирсон тал (Mongolia-specific)

- **Валют:** Монгол төгрөг (`MNT`, ₮). Дүнг **integer**-ээр (мөнгө хэрэглэхгүй). Format: `1,500 ₮`.
- **НӨАТ:** 10%. Тооцоо, баримтад тусга.
- **И-баримт (E-barimt):** Татварын Ерөнхий Газрын цахим НӨАТ-ын баримтын систем.
  Жижиглэн борлуулалтын POS-д **заавал интеграц** хийгдэнэ (иргэн/байгууллагын баримт,
  сугалааны дугаар, QR).
  - Албан ёсны `posapi` баримт бичигт нийцүүл. **Endpoint/формат зохиохгүй** — official
    спецээс ав. Хэрэв тодорхой бус бол асуу.
  - Баримтыг буухгүй (offline) үед дараалалд хийж, online болмогц илгээх логиктой бай.
- **Хэл:** UI default Монгол, Англи нэмэлт (`next-intl`).
- **Цагийн бүс:** `Asia/Ulaanbaatar` (UTC+8) дэлгэцэнд; DB-д UTC.
- **Түлшний грейд:** АИ-80, АИ-92, АИ-95, ДТ (дизель) — seed дататай нийцүүл.

---

## 13. Командууд (Commands)

```bash
# Суулгац
pnpm install

# Хөгжүүлэлт (бүх апп зэрэг)
pnpm dev                      # turbo: web + api зэрэг
pnpm --filter web dev         # зөвхөн frontend
pnpm --filter api dev         # зөвхөн backend

# Дэд бүтэц (Postgres, Redis, Loki)
docker compose up -d

# Өгөгдлийн сан (Prisma)
pnpm --filter api prisma migrate dev    # migration үүсгэх/хэрэглэх
pnpm --filter api prisma generate       # client үүсгэх
pnpm --filter api prisma studio         # GUI
pnpm --filter api prisma db seed        # seed дата (грейд, role, demo салбар)

# Чанар
pnpm lint
pnpm typecheck
pnpm test                     # бүх unit/integration
pnpm test:e2e                 # E2E
pnpm build                    # production build

# Format
pnpm format
```

> Шинэ багц нэмэхдээ workspace зөв сонго:
> `pnpm --filter <app> add <pkg>` (root-д бүхэлд нь зориулсан tool л нэм).

---

## 14. Кодын конвенц (Coding Conventions)

- **TypeScript strict.** `any` ашиглахгүй; зайлшгүй бол `unknown` + narrow.
- **Нэршил:** entity/type `PascalCase`, хувьсагч/функц `camelCase`, тогтмол `UPPER_SNAKE`,
  файл `kebab-case`. DB баганa `snake_case` (Prisma `@map`).
- **DTO/validation:** бүх API орц/гарц Zod схемтэй; type-ийг `packages/schemas`-аас infer.
- **Backend:** NestJS module/service/controller загвар. Бизнес логик service-д, controller нимгэн.
- **Алдаа:** typed exception + global filter. Хэрэглэгчид ойлгомжтой Монгол мессеж, дотооддоо англи лог.
- **Frontend:** server state → TanStack Query, локал UI state → Zustand/useState. Том компонентыг задал.
- **Мөнгө:** туслах функцээр (`formatMnt`, `parseMnt`) дамжуул. Гар тооцооллыг сервер баталгаажуулна.
- **Comment:** "юу"-г биш "яагаад"-ыг тайлбарла. Public функцэд JSDoc.
- **Commit:** Conventional Commits (`feat:`, `fix:`, `refactor:` ...).

---

## 15. Тест (Testing)

- **Unit:** Vitest — бизнес логик (үнэ тооцоо, тооцоо нийлэх, нөөц хорогдол) заавал.
- **Integration:** API + тест DB (Testcontainers/Postgres).
- **E2E:** Playwright — гол урсгал: борлуулалт, ээлж нээх/хаах, тайлан.
- **Санхүү/нөөцийн** логикт онцгой анхаар: edge case (тэг үлдэгдэл, буцаалт, offline sync, зөрүү).
- Шинэ feature → тест дагалдана. Bug засвар → regression тест нэмнэ.

---

## 16. Claude-д зориулсан ажиллах горим (Workflow for Claude)

1. **Эхлээд унш, дараа нь бич.** Холбогдох модуль/схемийг харж байж кодло.
2. **Жижиг, шалгаж болохуйц алхмаар.** Нэг дор асар их код биш, итерациар.
3. **Schema → migration → service → controller → UI** дарааллыг баримтал.
4. **Type/схемийг `packages`-д хуваал.** Front/back давхардуулж бичихгүй.
5. **Эгзэгтэй үйлдэлд audit + transaction** автоматаар оруул (§2, §8).
6. **Эргэлзвэл асуу** — ялангуяа: schema өөрчлөлт, мөнгө/татвар, И-баримт, dependency нэмэх,
   аюулгүй байдал, өгөгдөл устгах асуудлаар.
7. **Юу хийснээ товч тайлбарла** — гол шийдвэр, нэмсэн dependency, дараагийн алхам.
8. **Зорилгоо §1, §2-той нийцэж байгаа эсэхийг** өөрийгөө шалга.

---

## 17. Хэрэгжилтийн төлөв ба as-built заавар (Implementation status & as-built notes)

> §1–16 нь дизайны зорилго. Энэ хэсэг нь **бодитоор хэрэгжсэн** төлөв + ажиллуулах/шалгах
> практик зааврыг өгнө. Дэлгэрэнгүй түүх auto-memory-д (MEMORY.md).

### 17.1 Хэрэгжсэн төлөв

- ✅ Monorepo суурь, хуваалцсан `@fuel/types` / `@fuel/schemas` / `@fuel/config`
- ✅ Prisma домэйн схем бүрэн (§6), **12 migration** (init → hardening → audit_truncate_guard →
  refund_method_shift → shift_one_open_per_station → customers_admin → split_payment_refundline →
  product_group_image_supplier → employee_address → fuel_tank_partial_unique →
  shift_enum_values → shift_approval_workflow)
- ✅ Core: config(Zod env), Prisma, Redis, Pino(redaction), global error filter, RBAC guard,
  audit (append-only, DB trigger-ээр UPDATE/DELETE/TRUNCATE хориглосон), Redis throttle
- ✅ Auth (JWT access+refresh, Redis rotation, argon2). `GET /auth/me` → нэр + хандах салбарууд.
  Нууц reset / устгахад refresh-token сесс цуцлана (`TokenService.revokeAll`).
- ✅ §7.1 POS (transaction+audit+idempotency; void/refund), §7.2 нөөц, §7.4 санхүү тайлан
- ✅ **Split payment** — нэг борлуулалтад олон төлбөр (CASH/CARD/FUEL_CARD/MOBILE/**TRANSFER**/CREDIT);
  нийлбэр = нийт ЯГ; нэг хэлбэр давхардуулахгүй; бэлэн хариулт UI-д (applied л хадгална).
- ✅ **RefundLine** — буцаалт хэлбэр бүрээр; per-tender cap (төлсөн дүнгээс хэтрэхгүй); зээлийн
  буцаалт авлага руу; бэлэн буцаалтад нээлттэй ээлж заавал.
- ✅ **Харилцагч/зээл/авлага** (`modules/customers`) — компани-хэмжээ, зээлийн лимит, FOR UPDATE lock,
  авлага/өглөг тайлан; POS-д CREDIT төлбөр → `chargeCreditInTx` атомик.
- ✅ **Admin** (`modules/admin`, @Roles ADMIN) — салбар CRUD, ажилтан CRUD+эрх/салбар оноох+нууц reset,
  role→permission editor. Салбарын **резервуар (FuelTank) CRUD** нь `modules/stations`-д.
- ✅ **Бараа материал** — `ProductGroup` (бүлэг), `Product.groupId/supplierId/imageUrl`; зураг = **data URL**
  (камер/файл, ~600px шахсан); баркод = камер scan (**@zxing/browser**).
- ✅ **§7.3 ээлж — хүсэлт→батлах урсгал** (ShiftStatus: PENDING_OPEN→OPEN→PENDING_CLOSE→CLOSED):
  кассчин savны түлш (см+зураг `ShiftTankReading`) хэмжиж нээх хүсэлт → нягтлан/админ батлах;
  хаах хүсэлтэд тоолсон бэлэн + хэлбэрээр тушаалт vs тооцоо (`ShiftTender`) + см+зураг → батлах →
  `CashReconciliation`. Нэг салбарт нэг л идэвхтэй ээлж (partial unique `WHERE status <> CLOSED`);
  идэвхтэй ээлжтэй үед POS зарахгүй (status≠OPEN) = takeover хаалт.
- ✅ **Мөр сонгож буцаах (line-level refund) + нөөц сэргээх** (`RefundItem` model, migration
  `refund_item_stock_restore`): буцаалтад бараа/түлшний мөр+тоо сонгоно → тухайн тоо нөөцөд буцаж
  нэмэгдэнэ (reversing StockMovement `refType='refund'`), мөрийн НӨАТ-ыг тоо хэмжээгээр пропорциональ
  (үлдэгдлээр таслаж, сүүлийн буцаалтад яг үлдэгдэл). `RefundLine` (төлбөрийн хэлбэр) хэвээр —
  мөнгийг ХЭРХЭН, `RefundItem` ЮУГ буцаахыг илэрхийлнэ; items байвал tenderTotal===itemsTotal.
  Буцаалт/цуцлалт хоёулаа FOR UPDATE lock-той; буцаалт бүр нээлттэй ээлж шаардана (өнчин буцаалтгүй);
  буцаалттай борлуулалтыг цуцлахгүй (давхар сэргээлт хаах). Refund/Void эрхэд ACCOUNTANT нэмэгдсэн.
- ✅ **Тайлан модуль** (`/reports` hub + nav): хэвлэх + жинхэнэ **.xlsx** (exceljs, `lib/export-xlsx.ts`,
  client-side) бүх тайланд. Дундын `<PrintableReport/>` бүрхүүл + `@media print` (globals.css).
  Тайлангууд: Борлуулалтын тайлан (муж+харилцагч/түлш/бараа, `/finance/sales-report`), Борлуулалтын
  түүх+дэлгэрэнгүй+буцаалт/цуцлалт (`/pos/sales` шүүлттэй + `getSale` enriched), Авлага-өглөгийн
  дэвтэр (`/customers/:id/ledger` — эхний/эцсийн үлдэгдэл, дебет/кредит), НӨАТ (`/finance/vat`),
  Ээлжийн Z-тайлан+түүх (`/staff/shifts/history`, `/staff/shifts/:id/z-report`), Маржин, Түлшний
  нийлүүлэлт/нийлүүлэгч, Нөөцийн үнэлгээ, Нөөцийн хөдөлгөөн, Түлшний тулгалт (`/inventory/reports/*`).
- ✅ §4 realtime (Socket.IO), §9 offline-first (IndexedDB + idempotent sync, dead queue)
- ✅ Web хуудас (бүгд `'use client'`, нэвтрэлт шалгадаг): `/` dashboard (градиент KPI карт,
  салбарын төлөв, шуурхай үйлдэл, сүүлийн борлуулалт), `/login` (split-screen брэнд самбар),
  `/pos`, `/inventory`, `/materials`, `/staff` (ээлжийн хүсэлт), `/control` (хяналтын
  самбар: нягтлан/админ батлах), `/finance` (самбар), `/reports/*` (10 тайлан), `/customers`,
  `/admin`. **Бүрхүүл = `components/app-shell.tsx`** (root `layout.tsx`-д бүх хуудсыг ороосон):
  тогтмол хажуугийн цэс (модулиар бүлэглэсэн) + дээд мөр; `usePathname()` + токеноор `/login`/
  нэвтрээгүй үед chrome нууна (slot-уудаар children-ийг тогтмол индекстэй барьж remount-гүй).
  Модулийн толгой = `components/page-header.tsx` (градиент icon + гарчиг + үйлдэл). Top-level
  хуудаснаас `<BackLink/>` хассан (тайлангийн дэд хуудсууд `/reports`-руу буцах link-тэй хэвээр).
  Брэнд нэр: **"Шатахуун ERP"**. Apple-style (`globals.css`).
- ✅ **Нөөц/Агуулах — резервуарын шингэн долгион (liquid gauge):** `components/liquid-tank.tsx` нь
  түвшин/багтаамжийг хувиар + SVG долгионоор (seamless `translateX(-50%)`, `globals.css` `@keyframes
  tankWave`) харуулна; утга/дата шинэчлэгдэхэд өндөр (ус нэмэгдэх мэт) + өнгө зөөлөн шилжинэ
  (height/color transition). Аюулын өнгийг **систем өөрөө** бодно: DB-ийн `minLiters`-ээс доош буюу
  <10% = улаан (Маш бага), <25% шар (Бага), <55% цэнхэр (Хэвийн), бусад ногоон (Хангалттай). `/inventory`
  нь **бүх салбарын** савыг `inventoryApi.stock`-оор салбар бүрээр татаж (`reloadAllTanks`) grid-ээр
  харуулна; нийлүүлэлт хүлээн авмагц refresh хийж ус бодитоор нэмэгдэнэ.
- ⏳ Хэрэгжээгүй (зориуд): **И-баримт (§12)** — official posapi спец хэрэгтэй; BullMQ jobs;
  E2E/integration тест (одоогоор түр зуурын smoke script-ээр шалгадаг); ажилтны цалин (§7.3).

### 17.2 Локалаар ажиллуулах (энэ машин дээр)

- Docker Desktop унтарсан тул **локал PostgreSQL** ашигладаг (docker-compose биш). Энэ машинд
  **хоёр instance**: **PostgreSQL 18 → :5432 (апп үүнийг хэрэглэнэ)**, PostgreSQL 16 → :5433.
  superuser `postgres/postgres`; апп DB/role `fuel/fuel`, database `fuel` нь **:5432 (PG18)** дээр.
  Олон instance тул install.bat нь role/db-г `-p 5432`-д тулгаж үүсгэж, `fuel:fuel` нэвтрэлтийг
  баталгаажуулдаг (DATABASE_URL-ийн порттой таарах ёстой).
- **Redis (:6379)** — энэ машинд **Memurai суугаагүй**. `install.bat` нь Memurai байхгүй үед
  **портабл Redis (tporadowski v5.0.14.1)**-ийг `tools/redis/`-д (gitignore-д) татаж аваад асаадаг.
  start.bat нь дараалал: Memurai service → `tools/redis/redis-server.exe` → docker. Redis-гүйгээр
  login/refresh/throttle ажиллахгүй.
- **`install.bat`** (repo root, ASCII/CRLF) — **бүрэн автомат** нэг удаагийн суулгац: Node шалгах →
  pnpm байхгүй бол corepack, түүнгүй бол `npm i -g pnpm@9.15.9` өөрөө суулгана → .env → deps+build →
  Postgres `fuel` role/db → **Redis суулгаж асаана** → `migrate deploy` → `db:seed`. Төгсгөлд бүх
  бүрэлдэхүүний статус (Node/pnpm/DB/Redis) харуулна; Redis босоогүй бол тодорхой анхааруулна.
- **`start.bat`** (repo root, ASCII/CRLF) — port 3000/4000 + `*Desktop\gas station*` node-ийг унтрааж,
  Postgres service + Redis эсэхийг шалгаж асаагаад `db:generate` + `prisma migrate deploy` хийж `pnpm dev` асаана.
- TimescaleDB локалд байхгүй → `tank_reading` hypertable migration **алгасна** (энгийн хүснэгт).
- Env байршил: `apps/api/.env` (API+Prisma), `apps/web/.env.local` (NEXT_PUBLIC_*).
- DB бэлдэх: `pnpm db:migrate` (dev) эсвэл prod-д `prisma migrate deploy`; `pnpm db:seed`.
- Seed admin: **`admin` / `admin123`** (`SEED_ADMIN_PASSWORD`-аар дарж болно). Seed нь idempotent
  (грейд, role, demo салбар, ажилтан, **демо бараа+бүлэг+нийлүүлэгч**, резервуар, үнэ).

### 17.3 Build / тест / шалгах

- Build хийх дараалал чухал: `@fuel/types`, `@fuel/schemas` нь **CommonJS → dist** болж
  compile-дна; api/web эдгээрийн dist-ийг хэрэглэнэ. Turbo `^build` дарааллыг хангадаг.
  Тиймээс api typecheck-ээс өмнө багцуудыг build хийнэ (`pnpm build` / `pnpm typecheck`).
- Prisma client: api typecheck/build-ийн өмнө `pnpm db:generate` (api `@prisma/client` type
  импортолдог).
- Бүх тест: `pnpm test`. Зөвхөн нэг багц: `pnpm --filter @fuel/schemas test`.
  **Ганц тест файл:** `pnpm --filter @fuel/schemas exec vitest run src/money.test.ts`.
- E2E шалгалт (бодит DB-тэй): JWT-г гараар sign хийж (login Redis шаарддаг) authenticated
  endpoint-уудыг түр зуурын smoke script-ээр шалгасан туршлагатай; realtime-ийг
  socket.io-client-ээр. Эдгээр нь түр зуурын (commit хийдэггүй).

### 17.4 As-built конвенц / анхаарах (ил бус)

- **Мөнгө:** DB-д `BigInt`, **утсаар (JSON) string** болж дамждаг — `apps/api/src/main.ts`-ийн
  эхэнд `BigInt.prototype.toJSON` тохируулсан. Тооцоог `@fuel/schemas`-ийн `formatMnt`/
  `parseMnt`/`toMnt`/`lineTotalMnt`/`splitVatFromGross` -ээр л хийнэ. Тоо хэмжээ = 3-оронтой
  "milli" bigint (`toMilliUnits`/`milliToDecimalString`).
- **apps/api tsconfig: `incremental: false`** — nest `deleteOutDir` + tsbuildinfo зөрчилдөж,
  dist хоосон үлддэг алдааны улмаас унтраасан. БҮҮ эргүүлэн асаа.
- **Station scoping (§10):** service бүр `assertStationAccess(prisma, user, stationId)` (async,
  company-г DB-д шалгадаг) дуудна. `allStations` = ӨӨРИЙН компанийн бүх салбар (өөр tenant биш).
- **Нөөц сөрөг болж болно** (sale/adjust) — §1 "POS зогсохгүй" ёсоор зориуд; зөвхөн TRANSFER
  хатуу хүрэлцээ шалгана. Зөрүүг тооцоо нийлэх + alert-аар илрүүлж audit-д бичнэ.
- **Realtime emit нь transaction commit-ийн ДАРАА**, throw болохгүй (gateway try/catch).
  `RealtimeGateway`-г inject хийж `emitToStation(companyId, stationId, event, payload)`.
- **Offline sync:** `clientGeneratedId`-аар idempotent; terminal алдаа → IndexedDB dead queue
  (оператор шийднэ), түр зуурын → attempts cap-тай retry.
- **Тоо хэмжээ ≤3 бутархай:** UI-д ч JS float ашиглахгүй — `toMilliUnits`/`milliToDecimalString`-ээр
  (ж: сагсны тоо нэмэх). `Number(qty)+1` нь '0.118'→'1.1179999…' болж 3-оронтой regex-д унана.
- **Зураг = data URL** (камер/файл → canvas ~600px JPEG, DB-д inline). `imageUrl` Zod нь
  ''|http(s)|`data:image` хүлээнэ. Камер/scan утсан дээр **HTTPS** шаардлагатай (localhost OK).
- **Build дараалал (ил бус):** `nest build` нь `@fuel/schemas`-ийг **bundle хийдэг** — schemas-ийн
  эх өөрчилбөл api-г ДАХИН build (`pnpm --filter @fuel/schemas build` дараа `nest build`).
- **PostgreSQL enum:** шинэ enum утга нэмсэн **transaction дотроо ашиглаж болохгүй** → enum
  `ADD VALUE`-г ТУСДАА эртэх migration-д, ашиглалт (SET DEFAULT/column)-ийг дараагийнхад.
- **Partial unique index-ууд (raw SQL migration, schema-д @@unique биш):** нэг салбарт нэг идэвхтэй
  ээлж (`shift WHERE status<>'CLOSED'`), идэвхтэй савны код (`fuel_tank WHERE deleted_at IS NULL`).
  Schema-д `@@index` болгож, partial unique-ийг migration SQL-д гараар бичсэн.
- **`prisma migrate reset` нь Claude Code-д БЛОКЛОГДДОГ** (agent guard). Хэрэглэгдсэн migration-ийн
  SQL засвал reset-гүйгээр checksum-ийг тааруул: `sha256sum migration.sql` → `UPDATE _prisma_migrations
  SET checksum=...`. Шинэ DB дээр баталгаажуулахад `DATABASE_URL=...fuel_migtest prisma migrate deploy`.
- **Smoke script (түр зуурын `.mjs`):** JWT-г гараар sign (login Redis шаарддаг), бодит DB рүү fetch.
  Ажиллуулахын ӨМНӨ **port 4000-ийг заавал унтраа** (`Get-NetTCPConnection -LocalPort 4000 | Stop-Process`)
  — хуучин instance дээр зарагдаж буруу үр дүн өгдөг. Boot log-д "API асав" гарсныг хүлээ. Дуусаад устга.
- **`apps/web/.next` cache:** олон удаа build хийсний дараа "Cannot find module for page" хуурамч
  алдаа гарвал `rm -rf apps/web/.next` (кодын алдаа биш).
- **Ээлжийн эрх (separation of duties):** өөрийн илгээсэн ээлжийн хүсэлтийг батлахгүй (owner/admin
  override). Approve/reject = ACCOUNTANT (+owner/admin bypass). Савны tankId нь ээлжийн салбарт
  харьяалагдахыг шалгана (cross-tenant хаах).
- **Эгзэгтэй фаз бүрд adversarial review** (multi-agent Workflow) ажиллуулж, олдсон алдааг
  баталгаажуулж зассан туршлагатай — шинэ мөнгө/нөөц/audit/ээлж/auth логикт мөн хийхийг зөвлөнө.
- **Тайлан экспорт (ил бус):** Excel = **client-side exceljs** (`lib/export-xlsx.ts`, динамик import →
  base bundle-д ороохгүй); тайлан UI-ийн татсан ЯГ тэр JSON-оос үүснэ (WYSIWYG). Хэвлэх = `window.print()`
  + `.no-print` (toolbar/filter/back нуух) + `.print-area` (`globals.css @media print`). Шинэ тайлан =
  `<PrintableReport/>` + `reportsApi` дахин ашигла.
- **salesReport нийт/нэгтгэл (ил бус):** `totals`/`byGrade`/`byProduct`/`byMethod`/`byCustomer` нь
  DB aggregate-аар БҮХ тохирох мөрөөр (CAP-аас хамааралгүй); зөвхөн per-sale `items` жагсаалт 5000-аар
  таслагдана (`truncated` нь items-д л хамаатай). Мөр-түвшний accumulator-аар нийт бодохгүй (том тайланд
  доогуур гарна).
- **Буцаалтын инвариантууд (ил бус):** `RefundItem` мөр бүр нөөц сэргээнэ; НӨАТ пропорциональ боловч
  мөрийн үлдэгдэл НӨАТ-аас ХЭТРЭХГҮЙ (round-up хуримтлал хаах — сүүлийн буцаалтад яг үлдэгдэл).
  Түлш буцаахад савыг ЭХ борлуулалтын StockMovement (`refType='sale'`)-аас грейдээр олно (идэвхтэй сав
  солигдсон ч зөв саванд), tankless fallback. Буцаалт бүр **нээлттэй ээлж** шаардана. `voidSale` нь
  буцаалттай борлуулалтад хориотой; буцаалт/цуцлалт хоёулаа `SELECT … FOR UPDATE`.
- **AR/AP ledger (ил бус):** эхний үлдэгдэл = мужийн өмнөх сүүлчийн `CustomerTransaction.balanceAfterMnt`
  (эс бөгөөс 0); Дебет=amountMnt>0, Кредит=−amountMnt<0; эцсийн=эхний+дебет−кредит (subledger бүрэн бол
  сүүлчийн balanceAfterMnt-тай тэнцэнэ). Бүх балансын өөрчлөлт CustomerTransaction-аар явдаг тул дэвтэр
  бүрэн — seed-д шууд balanceMnt тавьсан тохиолдол л зөрж болзошгүй.
- **Shell-ийн өргөн (ил бус):** AppShell-ийн контент багана `flex flex-col` тул хуудасны `<main
  className="mx-auto max-w-…">` нь `w-full`-гүй бол өргөн дэлгэцэнд **контентоороо агшиж** голдоо
  төвлөрдөг (auto margin нь `align-items:stretch`-ийг дардаг). **Тиймээс бүх хуудасны контент `<main>`
  заавал `w-full`-тэй байна.** Конвенц: **апп/модул хуудас** (`/`, `/pos`, `/customers`, `/inventory`,
  `/materials`, `/finance`, `/control`, `/staff`(1600), `/admin`, `/sales-history`) = `mx-auto w-full
  max-w-[1700px]` (дэлгэц дүүргэнэ); **тайлан** (`/reports` + `/reports/*`) = `mx-auto w-full max-w-6xl`
  (баримт өргөн). Loader (`grid place-items-center`) main-д max-w/w-full хэрэггүй. `StationDto`-д
  `address` нэмсэн (`/stations` аль хэдийн буцаадаг). Admin-ийн салбарын мөр = Нэр/Хаяг/ажилтны тоо
  (employees-ээс)/зарагддаг түлш (салбар бүрийн tank-ийн грейд, `reload`-д урьдчилан татна); мөр дарж
  резервуар жагсаалт нээнэ.
- **Модал нь `Portal`-аар (ил бус):** хуудасны `<main>` нь `animation: fadeUp … both` (globals.css)-тэй
  бөгөөд transform-той keyframe + `both` fill нь Chromium-д **containing block** үүсгэдэг. Тиймээс модалын
  `position: fixed; inset: 0` нь viewport биш, `<main>`-ийн хайрцагт хязгаарлагдаж голд төвлөрөхгүй +
  зөвхөн хагас blur болдог. Засвар: **`components/portal.tsx` (`createPortal` → `document.body`)**-аар бүх
  модалыг (sales-history дэлгэрэнгүй, admin `Modal`, materials бараа/бүлэг/`ModalShell`) ороосон. **Шинэ
  модал нэмбэл заавал `<Portal>`-оор ороо.** Форм модалд backdrop-click-close нэмэхгүй (оролт алдахаас).

---

_Энэ файлыг төсөл хөгжихийн хэрээр шинэчилнэ. Шинэ модуль/дүрэм нэмэгдвэл энд тэмдэглэ._
