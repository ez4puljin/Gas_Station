'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type DeliveriesReport } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

export default function DeliveriesReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to });
  const [report, setReport] = useState<DeliveriesReport | null>(null);
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
      .then((s) => setStations(s))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await reportsApi.deliveries({
        from: f.from,
        to: f.to,
        stationId: f.stationId || undefined,
      });
      setReport(r);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  }, [f, router]);

  const rangeLabel = useMemo(() => (report ? `${report.from} — ${report.to}` : ''), [report]);

  async function doExport() {
    if (!report) return;
    setExporting(true);
    try {
      await exportXlsx(`niiluulelt-${report.from}_${report.to}`, [
        {
          name: 'Нийлүүлэлт',
          title: 'Түлшний нийлүүлэлтийн тайлан',
          meta: [
            `Хугацаа: ${report.from} — ${report.to}`,
            `Нийт нийлүүлэлт: ${report.totals.count}`,
            `Нийт литр: ${Number(report.totals.liters).toLocaleString()}`,
          ],
          columns: [
            { header: 'Огноо', key: 'date', width: 20 },
            { header: 'Салбар', key: 'station', width: 18 },
            { header: 'Грейд', key: 'grade', width: 14 },
            { header: 'Сав', key: 'tank', width: 12 },
            { header: 'Нийлүүлэгч', key: 'supplier', width: 20 },
            { header: 'Баримт', key: 'doc', width: 16 },
            { header: 'Литр', key: 'liters', numeric: true, width: 14 },
            { header: 'Нэгж өртөг', key: 'unitCost', money: true, width: 16 },
            { header: 'Нийт өртөг', key: 'totalCost', money: true, width: 18 },
          ],
          rows: report.items.map((i) => ({
            date: new Date(i.receivedAt).toLocaleString('mn-MN'),
            station: i.stationLabel,
            grade: i.grade,
            tank: i.tankCode ?? '',
            supplier: i.supplier ?? '',
            doc: i.documentNo ?? '',
            liters: i.liters,
            unitCost: i.unitCostMnt,
            totalCost: i.totalCostMnt,
          })),
          totals: { date: 'НИЙТ', liters: report.totals.liters, totalCost: report.totals.totalCostMnt },
        },
        {
          name: 'Грейдээр',
          columns: [
            { header: 'Грейд', key: 'grade', width: 16 },
            { header: 'Литр', key: 'liters', numeric: true, width: 14 },
            { header: 'Өртөг', key: 'cost', money: true, width: 18 },
          ],
          rows: report.byGrade.map((g) => ({ grade: g.grade, liters: g.liters, cost: g.costMnt })),
        },
        {
          name: 'Нийлүүлэгчээр',
          columns: [
            { header: 'Нийлүүлэгч', key: 'supplier', width: 24 },
            { header: 'Литр', key: 'liters', numeric: true, width: 14 },
            { header: 'Өртөг', key: 'cost', money: true, width: 18 },
          ],
          rows: report.bySupplier.map((s) => ({ supplier: s.supplier, liters: s.liters, cost: s.costMnt })),
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Truck size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Түлшний нийлүүлэлтийн тайлан</h1>
            <p className="text-sm text-muted-foreground">Огнооны муж, салбар, грейд, нийлүүлэгчээр</p>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-4">
          <Field label="Салбар">
            <select value={f.stationId} onChange={(e) => setF((s) => ({ ...s, stationId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүх салбар</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </Field>
          <Field label="Эхлэх"><input type="date" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="Дуусах"><input type="date" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="&nbsp;">
            <button onClick={run} disabled={loading} className="min-h-touch w-full rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">{loading ? 'Ачаалж…' : 'Тайлан гаргах'}</button>
          </Field>
        </div>
      </div>

      {report && (
        <PrintableReport title="Түлшний нийлүүлэлтийн тайлан" rangeLabel={rangeLabel} metaLines={[`Нийт нийлүүлэлт: ${report.totals.count}`]} onExportXlsx={doExport} exporting={exporting}>
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Нийлүүлэлт" value={report.totals.count.toLocaleString()} />
            <Stat label="Нийт литр" value={Number(report.totals.liters).toLocaleString()} />
            <Stat label="Нийт өртөг" value={formatMnt(report.totals.totalCostMnt)} />
          </section>

          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {report.byGrade.length > 0 && (
              <Mini title="Грейдээр" head={['Грейд', 'Литр', 'Өртөг']} rows={report.byGrade.map((g) => [g.grade, Number(g.liters).toLocaleString(), formatMnt(g.costMnt, { symbol: false })])} />
            )}
            {report.bySupplier.length > 0 && (
              <Mini title="Нийлүүлэгчээр" head={['Нийлүүлэгч', 'Литр', 'Өртөг']} rows={report.bySupplier.map((s) => [s.supplier, Number(s.liters).toLocaleString(), formatMnt(s.costMnt, { symbol: false })])} />
            )}
          </div>

          <h3 className="mb-2 text-sm font-semibold">Нийлүүлэлтүүд</h3>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Огноо</th>
                <th className="py-2 pr-2 font-medium">Салбар</th>
                <th className="py-2 pr-2 font-medium">Грейд</th>
                <th className="py-2 pr-2 font-medium">Нийлүүлэгч</th>
                <th className="py-2 pr-2 font-medium">Баримт</th>
                <th className="py-2 pr-2 text-right font-medium">Литр</th>
                <th className="py-2 pr-2 text-right font-medium">Нэгж өртөг</th>
                <th className="py-2 text-right font-medium">Нийт</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{new Date(i.receivedAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-1.5 pr-2">{i.stationLabel}</td>
                  <td className="py-1.5 pr-2">{i.grade}{i.tankCode ? <span className="text-xs text-muted-foreground"> · {i.tankCode}</span> : ''}</td>
                  <td className="py-1.5 pr-2">{i.supplier ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-xs text-muted-foreground">{i.documentNo ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{Number(i.liters).toLocaleString()}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatMnt(i.unitCostMnt, { symbol: false })}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatMnt(i.totalCostMnt, { symbol: false })}</td>
                </tr>
              ))}
              {report.items.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Нийлүүлэлт олдсонгүй</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-2" colSpan={5}>НИЙТ</td>
                <td className="py-2 pr-2 text-right tabular-nums">{Number(report.totals.liters).toLocaleString()}</td>
                <td className="py-2 pr-2"></td>
                <td className="py-2 text-right tabular-nums">{formatMnt(report.totals.totalCostMnt, { symbol: false })}</td>
              </tr>
            </tfoot>
          </table>
        </PrintableReport>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground" dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </label>
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
function Mini({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr>{head.map((h, i) => <th key={i} className={`pb-1.5 font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`py-1.5 ${j > 0 ? 'text-right tabular-nums' : 'font-medium'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
