'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type Valuation } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function todayUb(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function ValuationReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [report, setReport] = useState<Valuation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    posApi
      .stations()
      .then((s) => {
        setStations(s);
        if (s[0]) setStationId(s[0].id);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      })
      .finally(() => setReady(true));
  }, [router]);

  const run = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await reportsApi.valuation(stationId));
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [stationId, router]);

  const stationLabel = useMemo(() => stations.find((s) => s.id === report?.stationId)?.code ?? '', [stations, report]);
  const today = todayUb();

  async function doExport() {
    if (!report) return;
    setExporting(true);
    try {
      await exportXlsx(`nooc-uneelgee-${stationLabel || report.stationId}-${today}`, [
        {
          name: 'Бараа',
          title: 'Барааны үнэлгээ',
          meta: [`Салбар: ${stationLabel}`, `Огноо: ${today}`],
          columns: [
            { header: 'Нэр', key: 'name', width: 26 },
            { header: 'SKU', key: 'sku', width: 16 },
            { header: 'Тоо', key: 'qty', numeric: true, width: 12 },
            { header: 'Нэгж', key: 'unit', width: 10 },
            { header: 'Нэгж өртөг', key: 'cost', money: true, width: 16 },
            { header: 'Үнэлгээ', key: 'value', money: true, width: 18 },
          ],
          rows: report.products.map((p) => ({
            name: p.name,
            sku: p.sku,
            qty: p.quantity,
            unit: p.unit,
            cost: p.unitCostMnt,
            value: p.valueMnt,
          })),
          totals: { name: 'НИЙТ', value: report.totals.productValueMnt },
        },
        {
          name: 'Түлш',
          title: 'Түлшний үнэлгээ',
          meta: [`Салбар: ${stationLabel}`, `Огноо: ${today}`],
          columns: [
            { header: 'Сав', key: 'code', width: 14 },
            { header: 'Грейд', key: 'grade', width: 16 },
            { header: 'Литр', key: 'liters', numeric: true, width: 16 },
            { header: 'Үнэлгээ', key: 'value', money: true, width: 18 },
          ],
          rows: report.fuelTanks.map((t) => ({
            code: t.code,
            grade: t.grade,
            liters: t.currentLiters,
            value: t.valueMnt,
          })),
          totals: { code: 'НИЙТ', value: report.totals.fuelValueMnt },
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Boxes size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Нөөцийн үнэлгээ</h1>
            <p className="text-sm text-muted-foreground">Тухайн агшны бараа болон түлшний нөөцийн үнэлгээ</p>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-sm">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Салбар</span>
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm sm:w-48">
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
          </label>
          <button onClick={run} disabled={loading || !stationId} className="min-h-touch rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">{loading ? 'Ачаалж…' : 'Тайлан гаргах'}</button>
        </div>
      </div>

      {report && (
        <PrintableReport title="Нөөцийн үнэлгээ" rangeLabel={stationLabel} metaLines={[`Огноонд: ${today}`]} onExportXlsx={doExport} exporting={exporting}>
          <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Барааны үнэлгээ" value={formatMnt(report.totals.productValueMnt)} />
            <Stat label="Түлшний үнэлгээ" value={formatMnt(report.totals.fuelValueMnt)} />
            <Stat label="Нийт" value={formatMnt(report.totals.totalValueMnt)} />
          </section>

          <h3 className="mb-2 text-sm font-semibold">Бараа</h3>
          <table className="mb-6 w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Нэр</th>
                <th className="py-2 pr-2 font-medium">SKU</th>
                <th className="py-2 pr-2 text-right font-medium">Тоо</th>
                <th className="py-2 pr-2 text-right font-medium">Нэгж өртөг</th>
                <th className="py-2 text-right font-medium">Үнэлгээ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.products.map((p) => (
                <tr key={p.productId}>
                  <td className="py-1.5 pr-2 font-medium">{p.name}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{p.sku || '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{Number(p.quantity).toLocaleString()}{p.unit ? ` ${p.unit}` : ''}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatMnt(p.unitCostMnt, { symbol: false })}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatMnt(p.valueMnt, { symbol: false })}</td>
                </tr>
              ))}
              {report.products.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Бараа олдсонгүй</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold"><td className="py-2 pr-2" colSpan={4}>НИЙТ</td><td className="py-2 text-right tabular-nums">{formatMnt(report.totals.productValueMnt, { symbol: false })}</td></tr>
            </tfoot>
          </table>

          <h3 className="mb-2 text-sm font-semibold">Түлш</h3>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Сав</th>
                <th className="py-2 pr-2 font-medium">Грейд</th>
                <th className="py-2 pr-2 text-right font-medium">Литр</th>
                <th className="py-2 text-right font-medium">Үнэлгээ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.fuelTanks.map((t) => (
                <tr key={t.tankId}>
                  <td className="py-1.5 pr-2 font-medium">{t.code}</td>
                  <td className="py-1.5 pr-2">{t.grade}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{Number(t.currentLiters).toLocaleString()}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatMnt(t.valueMnt, { symbol: false })}</td>
                </tr>
              ))}
              {report.fuelTanks.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Сав олдсонгүй</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold"><td className="py-2 pr-2" colSpan={3}>НИЙТ</td><td className="py-2 text-right tabular-nums">{formatMnt(report.totals.fuelValueMnt, { symbol: false })}</td></tr>
            </tfoot>
          </table>
        </PrintableReport>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-blue-600">{value}</div>
    </div>
  );
}
