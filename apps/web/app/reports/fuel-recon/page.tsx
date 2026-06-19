'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fuel } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type FuelRecon } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange(): { from: string; to: string } {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

function liters(x: string): string {
  return `${Number(x).toLocaleString()} л`;
}

export default function FuelReconReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to });
  const [report, setReport] = useState<FuelRecon | null>(null);
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
        const first = s[0];
        if (first) setF((prev) => ({ ...prev, stationId: first.id }));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  const run = useCallback(async () => {
    if (!f.stationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await reportsApi.fuelRecon({ stationId: f.stationId, from: f.from, to: f.to });
      setReport(r);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  }, [f, router]);

  const rangeLabel = useMemo(() => (report ? `${report.from} — ${report.to}` : ''), [report]);
  const stationLabel = useMemo(() => stations.find((s) => s.id === report?.stationId)?.code ?? '', [stations, report]);

  async function doExport() {
    if (!report) return;
    setExporting(true);
    try {
      await exportXlsx(`tuls-tulgalt-${report.from}_${report.to}`, [
        {
          name: 'Түлшний тулгалт',
          title: 'Түлшний хөдөлгөөн / тулгалт',
          meta: [`Салбар: ${stationLabel}`, `Хугацаа: ${report.from} — ${report.to}`],
          columns: [
            { header: 'Сав', key: 'code', width: 14 },
            { header: 'Грейд', key: 'grade', width: 14 },
            { header: 'Нийлүүлэлт', key: 'delivered', numeric: true, width: 14 },
            { header: 'Зарсан', key: 'dispensed', numeric: true, width: 14 },
            { header: 'Буцаалт', key: 'returned', numeric: true, width: 14 },
            { header: 'Засвар', key: 'adjusted', numeric: true, width: 14 },
            { header: 'Цэвэр өөрчлөлт', key: 'netChange', numeric: true, width: 16 },
            { header: 'Одоогийн үлдэгдэл', key: 'currentLiters', numeric: true, width: 18 },
          ],
          rows: report.tanks.map((t) => ({
            code: t.code,
            grade: t.grade,
            delivered: t.delivered,
            dispensed: t.dispensed,
            returned: t.returned,
            adjusted: t.adjusted,
            netChange: t.netChange,
            currentLiters: t.currentLiters,
          })),
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Fuel size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Түлшний хөдөлгөөн / тулгалт</h1>
            <p className="text-sm text-muted-foreground">Сав тус бүрийн нийлүүлэлт, зарсан, засвар ба үлдэгдэл</p>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-4">
          <Field label="Салбар">
            <select value={f.stationId} onChange={(e) => setF((s) => ({ ...s, stationId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </Field>
          <Field label="Эхлэх"><input type="date" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="Дуусах"><input type="date" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="&nbsp;">
            <button onClick={run} disabled={loading || !f.stationId} className="min-h-touch w-full rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">{loading ? 'Ачаалж…' : 'Тайлан гаргах'}</button>
          </Field>
        </div>
      </div>

      {report && (
        <PrintableReport title="Түлшний хөдөлгөөн / тулгалт" rangeLabel={rangeLabel} metaLines={[`Салбар: ${stationLabel}`, `Сав: ${report.tanks.length}`]} onExportXlsx={doExport} exporting={exporting}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Сав</th>
                <th className="py-2 pr-2 font-medium">Грейд</th>
                <th className="py-2 pr-2 text-right font-medium">Нийлүүлэлт</th>
                <th className="py-2 pr-2 text-right font-medium">Зарсан</th>
                <th className="py-2 pr-2 text-right font-medium">Буцаалт</th>
                <th className="py-2 pr-2 text-right font-medium">Засвар</th>
                <th className="py-2 pr-2 text-right font-medium">Цэвэр өөрчлөлт</th>
                <th className="py-2 text-right font-medium">Одоогийн үлдэгдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.tanks.map((t) => (
                <tr key={t.tankId}>
                  <td className="py-2 pr-2 font-medium">{t.code}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{t.grade}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{liters(t.delivered)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{liters(t.dispensed)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{liters(t.returned)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{liters(t.adjusted)}</td>
                  <td className="py-2 pr-2 text-right font-medium tabular-nums">{liters(t.netChange)}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{liters(t.currentLiters)}</td>
                </tr>
              ))}
              {report.tanks.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Сав олдсонгүй</td></tr>
              )}
            </tbody>
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
