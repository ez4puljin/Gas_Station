'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Coins,
  CreditCard,
  Download,
  Droplets,
  Fuel,
  Hash,
  Minus,
  Package,
  Receipt,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { defaultRange, ReportFilters } from '@/components/report-filters';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type AnomalyReport, type DailyReport, financeApi, type KpiReport } from '@/lib/finance-api';
import { posApi, type StationDto } from '@/lib/pos-api';

function ubToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function prevDay(d: string): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
const toB = (s: string | undefined): bigint => {
  try {
    return BigInt(s ?? '0');
  } catch {
    return 0n;
  }
};

/**
 * Хувийн өөрчлөлт — BigInt-ээр 2 аравтын нарийвчлалтай бодоод сүүлд нь л Number болгоно
 * (мөнгөн дүн дээр float ашиглахгүй, §2.1).
 */
function deltaPct(cur: bigint, prev: bigint): number | null {
  if (prev === 0n) return cur === 0n ? 0 : null; // өмнөх 0 → хувь утгагүй
  const diff = cur - prev;
  return Number((diff * 10_000n) / prev) / 100;
}

export default function FinancePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [range, setRange] = useState(() => ({ from: ubToday(), to: ubToday() }));
  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [prev, setPrev] = useState<DailyReport | null>(null);
  const [kpi, setKpi] = useState<KpiReport | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const date = range.from;

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    posApi.stations()
      .then((list) => { setStations(list); if (list[0]) setStationId(list[0].id); })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Салбар ачаалахад алдаа гарлаа'); })
      .finally(() => setReady(true));
  }, [router]);

  const reload = useCallback(async (sid: string, d: string) => {
    setError(null);
    try {
      // Өмнөх өдрийг зэрэг татаж харьцуулна — тоо ганцаараа утга илэрхийлэхгүй.
      const [dr, pr, kr, ar] = await Promise.all([
        financeApi.daily(sid, d),
        financeApi.daily(sid, prevDay(d)).catch(() => null),
        financeApi.kpi(d),
        financeApi.anomalies(d, d, sid),
      ]);
      setDaily(dr); setPrev(pr); setKpi(kr); setAnomalies(ar);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
    }
  }, []);

  useEffect(() => { if (stationId && date) void reload(stationId, date); }, [stationId, date, reload]);

  // Төлбөрийн хэлбэрийн эзлэх хувь — жагсаалт биш, харьцаагаар харуулна.
  const methodRows = useMemo(() => {
    if (!daily) return [];
    const entries = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[])
      .map((m) => ({ m, v: toB(daily.byMethod[m]) }))
      .filter((x) => x.v > 0n);
    const max = entries.reduce((a, b) => (b.v > a ? b.v : a), 0n);
    const sum = entries.reduce((a, b) => a + b.v, 0n);
    return entries
      .sort((a, b) => (a.v === b.v ? 0 : a.v > b.v ? -1 : 1))
      .map((x) => ({
        ...x,
        pctOfMax: max === 0n ? 0 : Number((x.v * 100n) / max),
        share: sum === 0n ? 0 : Number((x.v * 1000n) / sum) / 10,
      }));
  }, [daily]);

  const gradeRows = useMemo(() => {
    if (!daily) return [];
    const max = daily.fuelByGrade.reduce((a, g) => (toB(g.amountMnt) > a ? toB(g.amountMnt) : a), 0n);
    return daily.fuelByGrade.map((g) => ({ ...g, pctOfMax: max === 0n ? 0 : Number((toB(g.amountMnt) * 100n) / max) }));
  }, [daily]);

  const kpiRows = useMemo(() => {
    if (!kpi) return [];
    const max = kpi.stations.reduce((a, s) => (toB(s.grossMnt) > a ? toB(s.grossMnt) : a), 0n);
    return kpi.stations
      .map((s) => ({ ...s, pctOfMax: max === 0n ? 0 : Number((toB(s.grossMnt) * 100n) / max) }))
      .sort((a, b) => (toB(a.grossMnt) === toB(b.grossMnt) ? 0 : toB(a.grossMnt) > toB(b.grossMnt) ? -1 : 1));
  }, [kpi]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  const hasAnomaly = !!anomalies && (anomalies.cashVariances.length > 0 || anomalies.largeRefunds.length > 0);

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-8">
      <PageHeader icon={BarChart3} title="Санхүү / Самбар" subtitle="Өдрийн үзүүлэлт — өмнөх өдөртэй харьцуулсан">
        <button
          onClick={() => financeApi.downloadCsv(stationId, date, tokenStore.access)}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Download size={16} /> CSV татах
        </button>
      </PageHeader>

      <ReportFilters range={range} onRange={setRange} singleDate dateLabel="Огноо">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Салбар</span>
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
            {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        </label>
      </ReportFilters>

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {daily && (
        <>
          {/* ── 1. Гол үзүүлэлт — хамгийн том, харьцуулалттай ── */}
          <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Hero
              label="Нийт борлуулалт"
              value={formatMnt(daily.grossMnt)}
              delta={deltaPct(toB(daily.grossMnt), toB(prev?.grossMnt))}
              sub={`${daily.salesCount} гүйлгээ · дундаж ${daily.salesCount > 0 ? formatMnt((toB(daily.grossMnt) / BigInt(daily.salesCount)).toString()) : '—'}`}
              tone="primary"
            />
            <Hero
              label="Цэвэр орлого (буцаалт хассан)"
              value={formatMnt(daily.netAfterRefundsMnt)}
              delta={deltaPct(toB(daily.netAfterRefundsMnt), toB(prev?.netAfterRefundsMnt))}
              sub={`НӨАТ ${formatMnt(daily.vatMnt)} · буцаалт ${formatMnt(daily.refundsMnt)}`}
              tone="emerald"
            />
          </section>

          {/* ── 2. Мөнгөний урсгал ── */}
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Бодит цуглуулсан" value={formatMnt(daily.collectedMnt)} icon={Wallet} delta={deltaPct(toB(daily.collectedMnt), toB(prev?.collectedMnt))} accent="text-blue-600" />
            <Metric label="Зээлд (авлага)" value={formatMnt(daily.creditMnt)} icon={CreditCard} delta={deltaPct(toB(daily.creditMnt), toB(prev?.creditMnt))} accent="text-amber-600" />
            <Metric label="НӨАТ (10%)" value={formatMnt(daily.vatMnt)} icon={Receipt} />
            <Metric label="Буцаалт" value={formatMnt(daily.refundsMnt)} icon={RotateCcw} accent={toB(daily.refundsMnt) > 0n ? 'text-destructive' : undefined} />
          </section>

          {/* ── 3. Үйл ажиллагааны тоо (жижиг, тусгаарласан) ── */}
          <section className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border bg-muted/30 px-4 py-3 text-sm">
            <Chip icon={Hash} label="Гүйлгээ" value={String(daily.salesCount)} />
            <Chip icon={XCircle} label="Цуцлалт" value={String(daily.voidCount)} danger={daily.voidCount > 0} />
            <Chip icon={Droplets} label="Түлш" value={`${Number(daily.fuelLiters).toLocaleString()} л`} />
            <Chip icon={Package} label="Дэлгүүрийн бараа" value={formatMnt(daily.productSalesMnt)} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Төлбөрийн хэлбэр — эзлэх хувиар */}
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <CreditCard size={16} className="text-muted-foreground" /> Төлбөрийн хэлбэр
              </h2>
              {methodRows.length === 0 ? (
                <Empty icon={CreditCard} text="Төлбөр алга" />
              ) : (
                <ul className="space-y-3">
                  {methodRows.map((r) => (
                    <li key={r.m}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span>{PAYMENT_METHOD_LABEL[r.m]}</span>
                        <span className="font-semibold tabular-nums">{formatMnt(r.v.toString(), { symbol: false })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${r.pctOfMax}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{r.share.toFixed(1)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Грейдээр түлш */}
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Fuel size={16} className="text-muted-foreground" /> Грейдээр түлш
              </h2>
              {gradeRows.length === 0 ? (
                <Empty icon={Fuel} text="Борлуулалт алга" />
              ) : (
                <ul className="space-y-3">
                  {gradeRows.map((g) => (
                    <li key={g.grade ?? '—'}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{g.grade ?? '—'}</span>
                        <span className="tabular-nums text-muted-foreground">{Number(g.liters).toLocaleString()} л</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${g.pctOfMax}%` }} />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums">{formatMnt(g.amountMnt, { symbol: false })}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Салбар хоорондын харьцуулалт */}
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <TrendingUp size={16} className="text-muted-foreground" /> Салбарын харьцуулалт
              </h2>
              {kpiRows.length === 0 ? (
                <Empty icon={TrendingUp} text="Өгөгдөл алга" />
              ) : (
                <ul className="space-y-3">
                  {kpiRows.map((s, i) => (
                    <li key={s.stationId}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className={`font-medium ${s.stationId === stationId ? 'text-primary' : ''}`}>
                          {i === 0 && <span className="mr-1 text-amber-500">★</span>}
                          {s.code}
                        </span>
                        <span className="font-semibold tabular-nums">{formatMnt(s.grossMnt, { symbol: false })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-all ${s.stationId === stationId ? 'bg-primary' : 'bg-slate-400'}`} style={{ width: `${s.pctOfMax}%` }} />
                        </div>
                        <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">чек {formatMnt(s.avgTicketMnt, { symbol: false })}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* ── Аномали ── */}
      {hasAnomaly && anomalies && (
        <section className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} />
            <h2 className="font-semibold">Анхаарах зүйл</h2>
          </div>
          {anomalies.cashVariances.length > 0 && (
            <div className="mb-4 text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium">
                <Coins size={15} className="text-muted-foreground" /> Бэлэн мөнгөний зөрүү
              </div>
              <ul className="space-y-1.5">
                {anomalies.cashVariances.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
                    <span className="text-muted-foreground">
                      Ээлж {v.shiftId.slice(0, 8)}… · хүлээгдэх {formatMnt(v.expectedCashMnt)} / бодит {formatMnt(v.countedCashMnt)}
                    </span>
                    <span className="font-semibold tabular-nums text-destructive">{formatMnt(v.varianceMnt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {anomalies.largeRefunds.length > 0 && (
            <div className="text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium">
                <ArrowLeftRight size={15} className="text-muted-foreground" /> Том буцаалт (≥ {formatMnt(anomalies.thresholdMnt)})
              </div>
              <ul className="space-y-1.5">
                {anomalies.largeRefunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm">
                    <span className="text-muted-foreground">{r.reason}</span>
                    <span className="font-semibold tabular-nums text-destructive">{formatMnt(r.amountMnt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

/** Өмнөх өдөртэй харьцуулсан өөрчлөлт. */
function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="text-xs text-muted-foreground">өмнөх өдөр 0</span>;
  const flat = Math.abs(v) < 0.05;
  const good = invert ? v < 0 : v > 0;
  const Icon = flat ? Minus : v > 0 ? TrendingUp : TrendingDown;
  const cls = flat ? 'text-muted-foreground' : good ? 'text-emerald-600' : 'text-destructive';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${cls}`}>
      <Icon size={13} />
      {flat ? '±0%' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
      <span className="font-normal text-muted-foreground">өчигдрөөс</span>
    </span>
  );
}

function Hero({ label, value, delta, sub, tone }: { label: string; value: string; delta: number | null; sub: string; tone: 'primary' | 'emerald' }) {
  const grad = tone === 'primary' ? 'from-blue-500 to-indigo-600 shadow-blue-500/25' : 'from-emerald-500 to-teal-600 shadow-emerald-500/25';
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-lg`}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="text-sm font-medium text-white/90">{label}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">{value}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {delta === null ? (
            <span className="text-xs text-white/70">өмнөх өдөр 0</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium tabular-nums">
              {Math.abs(delta) < 0.05 ? <Minus size={12} /> : delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(delta) < 0.05 ? '±0%' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
            </span>
          )}
          <span className="text-xs text-white/80">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, delta, accent }: { label: string; value: string; icon: typeof Coins; delta?: number | null; accent?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon size={14} /> {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${accent ?? ''}`}>{value}</div>
      {delta !== undefined && <div className="mt-1"><Delta v={delta} /></div>}
    </div>
  );
}

function Chip({ icon: Icon, label, value, danger }: { icon: typeof Coins; label: string; value: string; danger?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} className="text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-semibold tabular-nums ${danger ? 'text-destructive' : ''}`}>{value}</span>
    </span>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Coins; text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
      <Icon size={22} className="mb-1 opacity-40" />
      {text}
    </div>
  );
}
