'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { StockMovementType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type CatalogDto, posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type MovementReport } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

const TYPE_LABEL: Record<string, string> = {
  RECEIPT: 'Хүлээн авалт',
  SALE: 'Борлуулалт',
  ADJUSTMENT: 'Засвар',
  TRANSFER: 'Шилжүүлэг',
  LOSS: 'Хорогдол',
};

function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t;
}

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

export default function MovementsReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to, type: '', productId: '' });
  const [report, setReport] = useState<MovementReport | null>(null);
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
      .then(async (s) => {
        setStations(s);
        const first = s[0];
        if (first) {
          setF((cur) => ({ ...cur, stationId: cur.stationId || first.id }));
          const cat = await posApi.catalog(first.id).catch(() => null);
          setCatalog(cat);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  const run = useCallback(async () => {
    if (!f.stationId) {
      setError('Салбар сонгоно уу');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await reportsApi.movements({
        stationId: f.stationId,
        from: f.from,
        to: f.to,
        type: f.type || undefined,
        productId: f.productId || undefined,
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
  const stationLabel = useMemo(
    () => (report ? (stations.find((s) => s.id === report.stationId)?.code ?? report.stationId) : ''),
    [report, stations],
  );

  async function doExport() {
    if (!report) return;
    setExporting(true);
    try {
      await exportXlsx(`noots-hodolgoon-${report.from}_${report.to}`, [
        {
          name: 'Хөдөлгөөн',
          title: 'Нөөцийн хөдөлгөөний тайлан',
          meta: [
            `Салбар: ${stationLabel}`,
            `Хугацаа: ${report.from} — ${report.to}`,
            `Нийт бичлэг: ${report.count}`,
          ],
          columns: [
            { header: 'Огноо', key: 'date', width: 20 },
            { header: 'Төрөл', key: 'type', width: 16 },
            { header: 'Бараа/Сав', key: 'target', width: 24 },
            { header: 'Тоо хэмжээ', key: 'quantity', numeric: true, width: 14 },
            { header: 'Нэгж өртөг', key: 'unitCost', money: true, width: 16 },
            { header: 'Шалтгаан', key: 'reason', width: 24 },
            { header: 'Холбоос', key: 'ref', width: 16 },
          ],
          rows: report.items.map((m) => ({
            date: new Date(m.createdAt).toLocaleString('mn-MN'),
            type: typeLabel(m.type),
            target: m.product ?? m.fuelTankId ?? '—',
            quantity: m.quantity,
            unitCost: m.unitCostMnt ?? '',
            reason: m.reason ?? '',
            ref: m.refType ?? '',
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><ArrowLeftRight size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Нөөцийн хөдөлгөөний тайлан</h1>
            <p className="text-sm text-muted-foreground">Салбарын нөөцийн хөдөлгөөн төрлөөр (ledger)</p>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Салбар">
            <select value={f.stationId} onChange={(e) => setF((s) => ({ ...s, stationId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </Field>
          <Field label="Эхлэх"><input type="date" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="Дуусах"><input type="date" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="Төрөл">
            <select value={f.type} onChange={(e) => setF((s) => ({ ...s, type: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүгд</option>
              {(Object.keys(StockMovementType) as (keyof typeof StockMovementType)[]).map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
          </Field>
          <Field label="Бараа">
            <select value={f.productId} onChange={(e) => setF((s) => ({ ...s, productId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүгд</option>
              {catalog?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="&nbsp;">
            <button onClick={run} disabled={loading} className="min-h-touch w-full rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">{loading ? 'Ачаалж…' : 'Тайлан гаргах'}</button>
          </Field>
        </div>
      </div>

      {report && (
        <PrintableReport title="Нөөцийн хөдөлгөөний тайлан" rangeLabel={rangeLabel} metaLines={[`Салбар: ${stationLabel}`, `Нийт бичлэг: ${report.count}`]} onExportXlsx={doExport} exporting={exporting}>
          {Object.keys(report.byType).length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {Object.entries(report.byType).map(([t, c]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
                  {typeLabel(t)}
                  <span className="tabular-nums text-muted-foreground">{c}</span>
                </span>
              ))}
            </div>
          )}

          <h3 className="mb-2 text-sm font-semibold">Хөдөлгөөнүүд</h3>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Огноо</th>
                <th className="py-2 pr-2 font-medium">Төрөл</th>
                <th className="py-2 pr-2 font-medium">Бараа/Сав</th>
                <th className="py-2 pr-2 text-right font-medium">Тоо хэмжээ</th>
                <th className="py-2 pr-2 font-medium">Шалтгаан</th>
                <th className="py-2 font-medium">Холбоос</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{new Date(m.createdAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-1.5 pr-2">{typeLabel(m.type)}</td>
                  <td className="py-1.5 pr-2">{m.product ?? m.fuelTankId ?? '—'}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${m.quantity.startsWith('-') ? 'text-red-600' : ''}`}>{Number(m.quantity).toLocaleString()}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{m.reason ?? '—'}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{m.refType ?? '—'}</td>
                </tr>
              ))}
              {report.items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Хөдөлгөөн олдсонгүй</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold"><td className="py-2 pr-2" colSpan={5}>НИЙТ БИЧЛЭГ</td><td className="py-2 text-right tabular-nums">{report.count}</td></tr>
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
