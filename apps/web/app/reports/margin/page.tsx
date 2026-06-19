'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type MarginReport } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

export default function MarginReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to });
  const [report, setReport] = useState<MarginReport | null>(null);
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
        if (first) setF((prev) => ({ ...prev, stationId: prev.stationId || first.id }));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  const run = useCallback(async () => {
    if (!f.stationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await reportsApi.margin(f.stationId, f.from, f.to);
      setReport(r);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  }, [f, router]);

  const rangeLabel = useMemo(() => (report ? `${report.from} — ${report.to}` : ''), [report]);
  const stationLabel = useMemo(() => {
    const st = stations.find((s) => s.id === report?.stationId);
    return st ? `${st.code} · ${st.name}` : '';
  }, [stations, report]);

  async function doExport() {
    if (!report) return;
    setExporting(true);
    try {
      await exportXlsx(`marjin-${report.from}_${report.to}`, [
        {
          name: 'Маржин',
          title: 'Түлшний маржингийн тайлан',
          meta: [stationLabel ? `Салбар: ${stationLabel}` : '', `Хугацаа: ${report.from} — ${report.to}`].filter(Boolean) as string[],
          columns: [
            { header: 'Грейд', key: 'grade', width: 16 },
            { header: 'Литр', key: 'liters', numeric: true, width: 14 },
            { header: 'Орлого', key: 'revenue', money: true, width: 16 },
            { header: 'Өртөг', key: 'cogs', money: true, width: 16 },
            { header: 'Ашиг', key: 'margin', money: true, width: 16 },
            { header: 'Ашиг %', key: 'marginPct', numeric: true, width: 12 },
          ],
          rows: report.rows.map((r) => ({
            grade: r.grade ?? '—',
            liters: r.liters,
            revenue: r.revenueMnt,
            cogs: r.cogsMnt ?? '',
            margin: r.marginMnt ?? '',
            marginPct: r.marginPct != null ? r.marginPct.toFixed(1) : '',
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><TrendingUp size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Түлшний маржингийн тайлан</h1>
            <p className="text-sm text-muted-foreground">Грейдээр орлого, өртөг, ашиг</p>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-4">
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
        <PrintableReport
          title="Түлшний маржингийн тайлан"
          rangeLabel={rangeLabel}
          metaLines={stationLabel ? [`Салбар: ${stationLabel}`] : undefined}
          onExportXlsx={doExport}
          exporting={exporting}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Грейд</th>
                <th className="py-2 pr-2 text-right font-medium">Литр</th>
                <th className="py-2 pr-2 text-right font-medium">Орлого</th>
                <th className="py-2 pr-2 text-right font-medium">Өртөг</th>
                <th className="py-2 pr-2 text-right font-medium">Ашиг</th>
                <th className="py-2 text-right font-medium">Ашиг %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.rows.map((r, i) => (
                <tr key={r.grade ?? i}>
                  <td className="py-2 pr-2 font-medium">{r.grade ?? '—'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{Number(r.liters).toLocaleString()}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatMnt(r.revenueMnt, { symbol: false })}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.cogsMnt != null ? formatMnt(r.cogsMnt, { symbol: false }) : '—'}</td>
                  <td className="py-2 pr-2 text-right font-medium tabular-nums">{r.marginMnt != null ? formatMnt(r.marginMnt, { symbol: false }) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Энэ хугацаанд түлшний борлуулалт алга</td></tr>
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
