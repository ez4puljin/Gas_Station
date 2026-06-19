'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Percent } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type VatReport } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange(): { from: string; to: string } {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

export default function VatReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to });
  const [report, setReport] = useState<VatReport | null>(null);
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
      const r = await reportsApi.vat({
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

  const lines = useMemo(
    () =>
      report
        ? [
            { label: 'Татвартай борлуулалт (НӨАТ-гүй)', mnt: report.vatableNetMnt },
            { label: 'Татвартай борлуулалт (НӨАТ-тай)', mnt: report.vatableGrossMnt },
            { label: 'Гарсан НӨАТ (10%)', mnt: report.outputVatMnt },
            { label: 'Чөлөөлөгдсөн борлуулалт', mnt: report.exemptGrossMnt },
            { label: 'Буцаалтын НӨАТ', mnt: report.refundVatMnt },
            { label: 'Цэвэр НӨАТ', mnt: report.netVatMnt },
          ]
        : [],
    [report],
  );

  async function doExport() {
    if (!report) return;
    setExporting(true);
    try {
      const stationLabel = report.stationId ? stations.find((s) => s.id === report.stationId)?.code ?? report.stationId : 'Бүх салбар';
      await exportXlsx(`noat-${report.from}_${report.to}`, [
        {
          name: 'НӨАТ',
          title: 'НӨАТ-ын тайлан',
          meta: [`Хугацаа: ${report.from} — ${report.to}`, `Салбар: ${stationLabel}`, `Нийт борлуулалт: ${report.salesCount}`],
          columns: [
            { header: 'Үзүүлэлт', key: 'label', width: 36 },
            { header: 'Дүн', key: 'amount', money: true, width: 18 },
          ],
          rows: lines.map((l) => ({ label: l.label, amount: l.mnt })),
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Percent size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">НӨАТ-ын тайлан</h1>
            <p className="text-sm text-muted-foreground">Гарсан/буцаалтын НӨАТ, цэвэр төлбөл зохих</p>
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
        <PrintableReport title="НӨАТ-ын тайлан" rangeLabel={rangeLabel} metaLines={[`Нийт борлуулалт: ${report.salesCount}`]} onExportXlsx={doExport} exporting={exporting}>
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Нийт борлуулалт" value={formatMnt(report.grossMnt)} />
            <Stat label="Гарсан НӨАТ" value={formatMnt(report.outputVatMnt)} />
            <Stat label="Буцаалтын НӨАТ" value={formatMnt(report.refundVatMnt)} />
            <Stat label="Цэвэр НӨАТ" value={formatMnt(report.netVatMnt)} />
          </section>

          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Үзүүлэлт</th>
                <th className="py-2 text-right font-medium">Дүн</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.label}>
                  <td className="py-2 pr-2">{l.label}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{formatMnt(l.mnt, { symbol: false })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-2">Цэвэр төлбөл зохих НӨАТ</td>
                <td className="py-2 text-right tabular-nums">{formatMnt(report.netVatMnt, { symbol: false })}</td>
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
