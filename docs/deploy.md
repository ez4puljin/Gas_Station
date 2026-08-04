# Байршуулалт — Vercel (web) + Railway/Fly.io (API)

## Яагаад хоёр газар вэ

Vercel-ийн функцууд нь **хүсэлт дуусмагц унтардаг** тул дараах зүйлс ажиллахгүй:

| Шаардлага | Vercel дээр | Тайлбар |
|---|---|---|
| Socket.IO realtime | ❌ | Тогтмол WebSocket холболт боломжгүй |
| Redis (ioredis, TCP) | ❌ | Дуудалт бүрт шинэ холболт |
| Prisma → Postgres | ⚠️ | Холболтын сан дүүрнэ (pooling шаардана) |
| Next.js web | ✅ | Бүх хуудас статик prerender |

Тиймээс: **web → Vercel**, **API + Postgres + Redis → контейнер хост**.

---

## 1. API — Railway (хамгийн хялбар)

1. Railway → New Project → **Deploy from GitHub repo** → `ez4puljin/Gas_Station`
2. Root дахь `railway.json` нь `apps/api/Dockerfile`-ыг өөрөө олно
3. Тухайн project дотор **+ New → Database → PostgreSQL** ба **Redis** нэмнэ
4. API сервисийн **Variables**-д доорхыг оруулна:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NODE_ENV=production
LOG_LEVEL=info
JWT_ACCESS_SECRET=<санамсаргүй 32+ тэмдэгт>
JWT_REFRESH_SECRET=<өөр санамсаргүй 32+ тэмдэгт>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
CORS_ORIGINS=https://<vercel-домэйн>.vercel.app
```

> `PORT`-ыг Railway өөрөө өгнө — гараар тавихгүй.
> Migration нь контейнер асахад автоматаар тавигдана (`prisma migrate deploy`).

5. Domain үүсгэж (Settings → Networking → Generate Domain) URL-ыг тэмдэглэнэ.

### Fly.io-г сонговол

```bash
fly launch --no-deploy          # root дахь fly.toml-ыг ашиглана
fly postgres create             # эсвэл гадны Postgres
fly redis create                # Upstash
fly secrets set JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... CORS_ORIGINS=https://...
fly deploy
```

`fly.toml`-д `auto_stop_machines = false` — POS систем тул унтраахгүй (cold start нь
түгээгчийг хүлээлгэх ба Socket.IO холболт тасарна).

---

## 2. Web — Vercel

1. Vercel → Add New → Project → тэр л GitHub репог сонгоно
2. Root дахь `vercel.json` нь build дарааллыг зохицуулна
   (`@fuel/types` → `@fuel/schemas` → `web`; багцууд dist болж compile-ддэг тул заавал)
3. **Environment Variables**:

```
NEXT_PUBLIC_API_URL=https://<railway-эсвэл-fly-домэйн>
NEXT_PUBLIC_WS_URL=https://<адилхан домэйн>
```

> ⚠️ `NEXT_PUBLIC_*` нь **build үед шатаагддаг**. Утгыг өөрчилсөн бол
> web-ийг **дахин deploy** хийх ёстой — зөвхөн env солиход хангалтгүй.

4. Deploy хийсний дараа Vercel-ийн домэйныг API-гийн `CORS_ORIGINS`-д нэмж,
   **API-г дахин асаана**. Эс бөгөөс нэвтрэлт CORS-д хаагдана.

---

## 3. Эхний тохиргоо

Migration автоматаар тавигдана. Анхны admin хэрэглэгч үүсгэхийн тулд seed-ийг нэг удаа:

```bash
# Railway
railway run pnpm --filter @fuel/api exec prisma db seed
# Fly.io
fly ssh console -C "node /app/node_modules/tsx/dist/cli.mjs /app/apps/api/prisma/seed.ts"
```

Нэвтрэх: `admin` / `admin123` → **нууц үгээ нэн даруй солино.**

---

## Шалгах жагсаалт

- [ ] `JWT_*_SECRET` нь өвөрмөц, санамсаргүй (seed утга биш)
- [ ] `CORS_ORIGINS` нь Vercel-ийн жинхэнэ домэйн
- [ ] `NEXT_PUBLIC_API_URL` тохируулсны ДАРАА web дахин deploy хийгдсэн
- [ ] `/api/health` 200 буцааж байна
- [ ] Нэвтрэлт ажиллаж байна (Redis холбогдсоны шинж)
- [ ] Realtime — POS дээр борлуулалт хийхэд самбар шинэчлэгдэж байна (WebSocket)
- [ ] admin-ы нууц үг солигдсон
- [ ] Postgres-ийн нөөцлөлт (backup) идэвхтэй
