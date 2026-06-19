'use client';

import { useCallback, useEffect, useState } from 'react';
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
  LineChart,
  Package,
  Receipt,
  RotateCcw,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@fuel/types';
import { ApiException, apiFetch, tokenStore } from '@/lib/api';
import {
  type AnomalyReport,
  type DailyReport,
  financeApi,
  type KpiReport,
} from '@/lib/finance-api';
import { posApi, type StationDto } from '@/lib/pos-api';

function ubToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function FinancePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [date, setDate] = useState(ubToday());
  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [kpi, setKpi] = useState<KpiReport | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    posApi
      .stations()
      .then((list) => {
        setStations(list);
        if (list.length > 0) setStationId(list[0]!.id);
        setReady(true);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Салбар ачаалахад алдаа гарлаа');
        setReady(true);
      });
  }, [router]);

  const reload = useCallback(async (sid: string, d: string) => {
    setError(null);
    try {
      const [dr, kr, ar] = await Promise.all([
        financeApi.daily(sid, d),
        financeApi.kpi(d),
        financeApi.anomalies(d, d, sid),
      ]);
      setDaily(dr);
      setKpi(kr);
      setAnomalies(ar);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
    }
  }, []);

  useEffect(() => {
    if (stationId && date) void reload(stationId, date);
  }, [stationId, date, reload]);

  if (!ready) {
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-8">
      <PageHeader icon={BarChart3} title="Санхүү / Самбар" subtitle="Өдрийн борлуулалт, KPI, аномали">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-touch rounded-xl border bg-background px-3 text-sm shadow-sm"
        />
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="min-h-touch rounded-xl border bg-background px-3 text-sm shadow-sm"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => financeApi.downloadCsv(stationId, date, tokenStore.access)}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Download size={16} /> CSV татах
        </button>
      </PageHeader>

      {error && (
        <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Өдрийн тайлан */}
      {daily && (
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Нийт борлуулалт" value={formatMnt(daily.grossMnt)} icon={TrendingUp} money />
          <Stat label="НӨАТ (10%)" value={formatMnt(daily.vatMnt)} icon={Receipt} money />
          <Stat label="Буцаалт" value={formatMnt(daily.refundsMnt)} icon={RotateCcw} money />
          <Stat label="Цэвэр (буцаалт хассан)" value={formatMnt(daily.netAfterRefundsMnt)} icon={Coins} money />
          <Stat label="Бодит цуглуулсан" value={formatMnt(daily.collectedMnt)} icon={Wallet} money />
          <Stat label="Зээлд (авлага)" value={formatMnt(daily.creditMnt)} icon={CreditCard} money />
          <Stat label="Гүйлгээний тоо" value={String(daily.salesCount)} icon={Hash} />
          <Stat label="Цуцлалт" value={String(daily.voidCount)} icon={XCircle} />
          <Stat label="Түлш (нийт литр)" value={`${Number(daily.fuelLiters).toLocaleString()} л`} icon={Droplets} />
          <Stat label="Дэлгүүрийн бараа" value={formatMnt(daily.productSalesMnt)} icon={Package} money />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Төлбөрийн хэлбэр + грейд */}
        {daily && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard size={18} className="text-muted-foreground" />
              <h2 className="font-semibold">Төлбөрийн хэлбэр</h2>
            </div>
            <ul className="mb-5 divide-y text-sm">
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <li key={m} className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[m]}</span>
                  <span className="font-semibold tabular-nums text-blue-600">{formatMnt(daily.byMethod[m] ?? '0')}</span>
                </li>
              ))}
            </ul>
            <div className="mb-3 flex items-center gap-2">
              <Fuel size={18} className="text-muted-foreground" />
              <h2 className="font-semibold">Грейдээр түлш</h2>
            </div>
            {daily.fuelByGrade.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                <Fuel size={22} className="mb-1 opacity-40" />
                Борлуулалт алга
              </div>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {daily.fuelByGrade.map((f) => (
                    <tr key={f.grade}>
                      <td className="py-2 font-medium">{f.grade}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{Number(f.liters).toLocaleString()} л</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-blue-600">{formatMnt(f.amountMnt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* KPI — салбар хооронд */}
        {kpi && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <LineChart size={18} className="text-muted-foreground" />
              <h2 className="font-semibold">KPI — салбар хооронд</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="pb-2 font-medium">Салбар</th>
                  <th className="pb-2 text-right font-medium">Борлуулалт</th>
                  <th className="pb-2 text-right font-medium">Дундаж чек</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {kpi.stations.map((s) => (
                  <tr key={s.stationId}>
                    <td className="py-2 font-medium">{s.code}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-blue-600">{formatMnt(s.grossMnt)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{formatMnt(s.avgTicketMnt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* Аномали */}
      {anomalies && (anomalies.cashVariances.length > 0 || anomalies.largeRefunds.length > 0) && (
        <section className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} />
            <h2 className="font-semibold">Аномали</h2>
          </div>
          {anomalies.cashVariances.length > 0 && (
            <div className="mb-4 text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium">
                <Coins size={15} className="text-muted-foreground" /> Бэлэн мөнгөний зөрүү:
              </div>
              <ul className="space-y-1.5">
                {anomalies.cashVariances.map((v) => (
                  <li key={v.id} className="rounded-xl border bg-card px-3 py-2 shadow-sm">
                    Ээлж {v.shiftId.slice(0, 8)}…: зөрүү{' '}
                    <span className="font-semibold tabular-nums text-destructive">{formatMnt(v.varianceMnt)}</span>{' '}
                    <span className="text-muted-foreground">
                      (хүлээгдэх {formatMnt(v.expectedCashMnt)}, бодит {formatMnt(v.countedCashMnt)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {anomalies.largeRefunds.length > 0 && (
            <div className="text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium">
                <ArrowLeftRight size={15} className="text-muted-foreground" /> Том буцаалт (≥ {formatMnt(anomalies.thresholdMnt)}):
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

function Stat({
  label,
  value,
  icon: Icon,
  money = false,
}: {
  label: string;
  value: string;
  icon: typeof Coins;
  money?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon size={14} />
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${money ? 'text-blue-600' : ''}`}>{value}</div>
    </div>
  );
}
