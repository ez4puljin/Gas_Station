'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReceiptText } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, SALE_STATUS_LABEL } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type CatalogDto, posApi, type StationDto } from '@/lib/pos-api';
import { customersApi, type Customer } from '@/lib/customers-api';
import { reportsApi, type SalesReport } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

export default function SalesReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to, customerId: '', fuelGradeId: '', productId: '', method: '', status: '', search: '' });
  const [report, setReport] = useState<SalesReport | null>(null);
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
        const [cat, cust] = await Promise.all([
          s[0] ? posApi.catalog(s[0].id).catch(() => null) : Promise.resolve(null),
          customersApi.list().catch(() => []),
        ]);
        setCatalog(cat);
        setCustomers(cust);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await reportsApi.salesReport({
        from: f.from,
        to: f.to,
        stationId: f.stationId || undefined,
        customerId: f.customerId || undefined,
        fuelGradeId: f.fuelGradeId || undefined,
        productId: f.productId || undefined,
        method: f.method || undefined,
        status: f.status || undefined,
        search: f.search || undefined,
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
      await exportXlsx(`borluulalt-${report.from}_${report.to}`, [
        {
          name: 'Борлуулалт',
          title: 'Борлуулалтын тайлан',
          meta: [`Хугацаа: ${report.from} — ${report.to}`, `Нийт гүйлгээ: ${report.totals.count}`],
          columns: [
            { header: 'Огноо', key: 'date', width: 18 },
            { header: 'Салбар', key: 'station', width: 18 },
            { header: 'Кассчин', key: 'cashier', width: 16 },
            { header: 'Харилцагч', key: 'customer', width: 18 },
            { header: 'Төлбөр', key: 'methods', width: 16 },
            { header: 'НӨАТ', key: 'vat', money: true, width: 14 },
            { header: 'Нийт', key: 'total', money: true, width: 16 },
          ],
          rows: report.items.map((s) => ({
            date: new Date(s.soldAt).toLocaleString('mn-MN'),
            station: s.stationLabel ?? '',
            cashier: s.cashierName ?? '',
            customer: s.customerName ?? '',
            methods: s.methods.map((m) => PAYMENT_METHOD_LABEL[m.method as PaymentMethod]).join(', '),
            vat: s.vatMnt,
            total: s.totalMnt,
          })),
          totals: { date: 'НИЙТ', vat: report.totals.vatMnt, total: report.totals.grossMnt },
        },
        {
          name: 'Грейдээр',
          columns: [
            { header: 'Грейд', key: 'grade', width: 16 },
            { header: 'Литр', key: 'liters', numeric: true, width: 14 },
            { header: 'Дүн', key: 'amount', money: true, width: 16 },
          ],
          rows: report.byGrade.map((g) => ({ grade: g.grade, liters: g.liters, amount: g.amountMnt })),
        },
        {
          name: 'Бараагаар',
          columns: [
            { header: 'Бараа', key: 'product', width: 24 },
            { header: 'Тоо', key: 'qty', numeric: true, width: 12 },
            { header: 'Дүн', key: 'amount', money: true, width: 16 },
          ],
          rows: report.byProduct.map((p) => ({ product: p.product, qty: p.quantity, amount: p.amountMnt })),
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><ReceiptText size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Борлуулалтын тайлан</h1>
            <p className="text-sm text-muted-foreground">Огнооны муж, харилцагч/түлш/бараагаар</p>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Салбар">
            <select value={f.stationId} onChange={(e) => setF((s) => ({ ...s, stationId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүх салбар</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </Field>
          <Field label="Эхлэх"><input type="date" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="Дуусах"><input type="date" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" /></Field>
          <Field label="Харилцагч">
            <select value={f.customerId} onChange={(e) => setF((s) => ({ ...s, customerId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүгд</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Түлш">
            <select value={f.fuelGradeId} onChange={(e) => setF((s) => ({ ...s, fuelGradeId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүгд</option>
              {catalog?.fuels.map((g) => <option key={g.fuelGradeId} value={g.fuelGradeId}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Бараа">
            <select value={f.productId} onChange={(e) => setF((s) => ({ ...s, productId: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүгд</option>
              {catalog?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Төлбөр">
            <select value={f.method} onChange={(e) => setF((s) => ({ ...s, method: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm">
              <option value="">Бүгд</option>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
            </select>
          </Field>
          <Field label="&nbsp;">
            <button onClick={run} disabled={loading} className="min-h-touch w-full rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">{loading ? 'Ачаалж…' : 'Тайлан гаргах'}</button>
          </Field>
        </div>
      </div>

      {report && (
        <PrintableReport title="Борлуулалтын тайлан" rangeLabel={rangeLabel} metaLines={[`Нийт гүйлгээ: ${report.totals.count}${report.truncated ? ` (эхний 5000 харуулав)` : ''}`]} onExportXlsx={doExport} exporting={exporting}>
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Нийт борлуулалт" value={formatMnt(report.totals.grossMnt)} />
            <Stat label="НӨАТ" value={formatMnt(report.totals.vatMnt)} />
            <Stat label="Буцаалт" value={formatMnt(report.totals.refundsMnt)} />
            <Stat label="Цэвэр" value={formatMnt(report.totals.netAfterRefundsMnt)} />
          </section>

          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {report.byGrade.length > 0 && (
              <Mini title="Грейдээр түлш" head={['Грейд', 'Литр', 'Дүн']} rows={report.byGrade.map((g) => [g.grade, Number(g.liters).toLocaleString(), formatMnt(g.amountMnt, { symbol: false })])} />
            )}
            {report.byProduct.length > 0 && (
              <Mini title="Бараагаар" head={['Бараа', 'Тоо', 'Дүн']} rows={report.byProduct.map((p) => [p.product, p.quantity, formatMnt(p.amountMnt, { symbol: false })])} />
            )}
          </div>

          <h3 className="mb-2 text-sm font-semibold">Гүйлгээнүүд</h3>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Огноо</th>
                <th className="py-2 pr-2 font-medium">Кассчин</th>
                <th className="py-2 pr-2 font-medium">Харилцагч</th>
                <th className="py-2 pr-2 font-medium">Төлбөр</th>
                <th className="py-2 text-right font-medium">Нийт</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{new Date(s.soldAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-1.5 pr-2">{s.cashierName ?? '—'}</td>
                  <td className="py-1.5 pr-2">{s.customerName ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-xs text-muted-foreground">{s.methods.map((m) => PAYMENT_METHOD_LABEL[m.method as PaymentMethod]).join(', ')}{s.status !== 'COMPLETED' ? ` · ${SALE_STATUS_LABEL[s.status as keyof typeof SALE_STATUS_LABEL]}` : ''}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatMnt(s.totalMnt, { symbol: false })}</td>
                </tr>
              ))}
              {report.items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Борлуулалт олдсонгүй</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold"><td className="py-2 pr-2" colSpan={4}>НИЙТ</td><td className="py-2 text-right tabular-nums">{formatMnt(report.totals.grossMnt, { symbol: false })}</td></tr>
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
function Mini({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
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
