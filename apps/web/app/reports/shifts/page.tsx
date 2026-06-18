'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, SHIFT_STATUS_LABEL, type ShiftStatus } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { reportsApi, type ShiftHistory, type ZReport } from '@/lib/reports-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange(): { from: string; to: string } {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}

function statusLabel(s: string): string {
  return SHIFT_STATUS_LABEL[s as ShiftStatus] ?? s;
}
function methodLabel(m: string): string {
  return PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m;
}

export default function ShiftsReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [f, setF] = useState({ stationId: '', from: monthRange().from, to: monthRange().to });
  const [history, setHistory] = useState<ShiftHistory | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zError, setZError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zLoading, setZLoading] = useState(false);
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
    setSelId(null);
    setZReport(null);
    setZError(null);
    try {
      const r = await reportsApi.shiftHistory({
        from: f.from,
        to: f.to,
        stationId: f.stationId || undefined,
      });
      setHistory(r);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  }, [f, router]);

  const openZ = useCallback(
    async (shiftId: string) => {
      setSelId(shiftId);
      setZLoading(true);
      setZError(null);
      setZReport(null);
      try {
        const z = await reportsApi.zReport(shiftId);
        setZReport(z);
      } catch (e) {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setZError(e instanceof ApiException ? e.error.message : 'Z-тайлан ачаалахад алдаа гарлаа');
      } finally {
        setZLoading(false);
      }
    },
    [router],
  );

  const zRangeLabel = useMemo(() => {
    if (!zReport) return '';
    const o = new Date(zReport.shift.openedAt).toLocaleString('mn-MN');
    const c = zReport.shift.closedAt ? new Date(zReport.shift.closedAt).toLocaleString('mn-MN') : '—';
    return `${o} → ${c}`;
  }, [zReport]);

  async function doExport() {
    if (!zReport) return;
    setExporting(true);
    try {
      await exportXlsx(`eelj-z-tailan-${zReport.shift.id}`, [
        {
          name: 'Төлбөрийн хэлбэр',
          title: 'Ээлжийн Z-тайлан',
          meta: [
            zReport.shift.stationLabel ?? '',
            `Төлөв: ${statusLabel(zReport.shift.status)}`,
            `Нээсэн: ${new Date(zReport.shift.openedAt).toLocaleString('mn-MN')}`,
            zReport.shift.closedAt ? `Хаасан: ${new Date(zReport.shift.closedAt).toLocaleString('mn-MN')}` : '',
            `Кассчид: ${zReport.cashiers.join(', ') || '—'}`,
          ].filter(Boolean),
          columns: [
            { header: 'Төлбөрийн хэлбэр', key: 'method', width: 20 },
            { header: 'Тушаасан', key: 'declared', money: true, width: 16 },
            { header: 'Тооцоо', key: 'expected', money: true, width: 16 },
            { header: 'Зөрүү', key: 'variance', money: true, width: 16 },
          ],
          rows: zReport.tenders.map((t) => ({
            method: methodLabel(t.method),
            declared: t.declaredMnt,
            expected: t.expectedMnt,
            variance: t.varianceMnt,
          })),
        },
        {
          name: 'Грейдээр',
          columns: [
            { header: 'Грейд', key: 'grade', width: 16 },
            { header: 'Литр', key: 'liters', numeric: true, width: 14 },
            { header: 'Дүн', key: 'amount', money: true, width: 16 },
          ],
          rows: zReport.fuelByGrade.map((g) => ({
            grade: g.grade ?? '—',
            liters: g.liters,
            amount: g.amountMnt,
          })),
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><CalendarClock size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ээлжийн тайлан</h1>
            <p className="text-sm text-muted-foreground">Ээлжийн түүх, мөрийг сонгож Z-тайлан харах</p>
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

        {history && (
          <div className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold">Ээлжийн түүх ({history.from} — {history.to})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Нээсэн огноо</th>
                    <th className="py-2 pr-2 font-medium">Салбар</th>
                    <th className="py-2 pr-2 font-medium">Кассчид</th>
                    <th className="py-2 pr-2 font-medium">Төлөв</th>
                    <th className="py-2 pr-2 text-right font-medium">Борлуулалт</th>
                    <th className="py-2 text-right font-medium">Зөрүү</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.shifts.map((sh) => {
                    const hasVar = sh.varianceMnt !== null && BigInt(sh.varianceMnt) !== 0n;
                    return (
                      <tr
                        key={sh.id}
                        onClick={() => void openZ(sh.id)}
                        className={`cursor-pointer transition hover:bg-accent ${selId === sh.id ? 'bg-accent' : ''}`}
                      >
                        <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(sh.openedAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-1.5 pr-2">{sh.stationLabel ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{sh.cashiers.join(', ') || '—'}</td>
                        <td className="py-1.5 pr-2 text-xs text-muted-foreground">{statusLabel(sh.status)}</td>
                        <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{formatMnt(sh.salesTotalMnt, { symbol: false })}</td>
                        <td className={`py-1.5 text-right tabular-nums ${hasVar ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{sh.varianceMnt !== null ? formatMnt(sh.varianceMnt, { symbol: false }) : '—'}</td>
                      </tr>
                    );
                  })}
                  {history.shifts.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Ээлж олдсонгүй</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {zError && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{zError}</p>}
        {selId && zLoading && <p className="mb-4 text-sm text-muted-foreground">Z-тайлан ачаалж байна…</p>}
      </div>

      {zReport && (
        <PrintableReport
          title="Ээлжийн Z-тайлан"
          companyName={zReport.shift.stationLabel}
          rangeLabel={zRangeLabel}
          metaLines={[
            `Төлөв: ${statusLabel(zReport.shift.status)}`,
            `Кассчид: ${zReport.cashiers.join(', ') || '—'}`,
            `Гүйлгээ: ${zReport.sales.count} · Буцаалт: ${zReport.refunds.count}`,
          ]}
          onExportXlsx={doExport}
          exporting={exporting}
        >
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Нийт борлуулалт" value={formatMnt(zReport.sales.grossMnt)} />
            <Stat label="НӨАТ" value={formatMnt(zReport.sales.vatMnt)} />
            <Stat label="Буцаалт" value={formatMnt(zReport.refunds.amountMnt)} />
            <Stat label="Эхлэх бэлэн" value={formatMnt(zReport.shift.openingCashMnt)} />
          </section>

          <h3 className="mb-2 text-sm font-semibold">Ээлжийн мэдээлэл</h3>
          <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <Info label="Нээсэн" value={new Date(zReport.shift.openedAt).toLocaleString('mn-MN')} />
            <Info label="Хаасан" value={zReport.shift.closedAt ? new Date(zReport.shift.closedAt).toLocaleString('mn-MN') : '—'} />
            <Info label="Нээлт батлагдсан" value={zReport.shift.openApprovedAt ? new Date(zReport.shift.openApprovedAt).toLocaleString('mn-MN') : '—'} />
            <Info label="Хаалт хүсэлт" value={zReport.shift.closeRequestedAt ? new Date(zReport.shift.closeRequestedAt).toLocaleString('mn-MN') : '—'} />
            <Info label="Эхлэх бэлэн" value={`${formatMnt(zReport.shift.openingCashMnt, { symbol: false })} ₮`} />
            <Info label="Эцсийн бэлэн" value={zReport.shift.closingCashMnt !== null ? `${formatMnt(zReport.shift.closingCashMnt, { symbol: false })} ₮` : '—'} />
            {zReport.shift.note && <Info label="Тэмдэглэл" value={zReport.shift.note} />}
          </div>

          <h3 className="mb-2 text-sm font-semibold">Төлбөрийн хэлбэрээр</h3>
          <table className="mb-5 w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Хэлбэр</th>
                <th className="py-2 pr-2 text-right font-medium">Тушаасан</th>
                <th className="py-2 pr-2 text-right font-medium">Тооцоо</th>
                <th className="py-2 text-right font-medium">Зөрүү</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {zReport.tenders.map((t) => {
                const hasVar = BigInt(t.varianceMnt) !== 0n;
                return (
                  <tr key={t.method}>
                    <td className="py-1.5 pr-2 font-medium">{methodLabel(t.method)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatMnt(t.declaredMnt, { symbol: false })}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatMnt(t.expectedMnt, { symbol: false })}</td>
                    <td className={`py-1.5 text-right tabular-nums ${hasVar ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{formatMnt(t.varianceMnt, { symbol: false })}</td>
                  </tr>
                );
              })}
              {zReport.tenders.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Төлбөр алга</td></tr>}
            </tbody>
          </table>

          {zReport.fuelByGrade.length > 0 && (
            <>
              <h3 className="mb-2 text-sm font-semibold">Грейдээр түлш</h3>
              <table className="mb-5 w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Грейд</th>
                    <th className="py-2 pr-2 text-right font-medium">Литр</th>
                    <th className="py-2 text-right font-medium">Дүн</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {zReport.fuelByGrade.map((g, i) => (
                    <tr key={`${g.grade ?? 'x'}-${i}`}>
                      <td className="py-1.5 pr-2 font-medium">{g.grade ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{Number(g.liters).toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMnt(g.amountMnt, { symbol: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {zReport.tankReadings.length > 0 && (
            <>
              <h3 className="mb-2 text-sm font-semibold">Савны хэмжилт</h3>
              <table className="mb-5 w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Сав</th>
                    <th className="py-2 pr-2 font-medium">Үе</th>
                    <th className="py-2 pr-2 text-right font-medium">См</th>
                    <th className="py-2 text-right font-medium">Литр</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {zReport.tankReadings.map((r, i) => (
                    <tr key={`${r.tankCode}-${r.phase}-${i}`}>
                      <td className="py-1.5 pr-2 font-medium">{r.tankCode}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{r.phase}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{Number(r.centimeters).toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.liters !== null ? Number(r.liters).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 className="mb-2 text-sm font-semibold">Бэлэн мөнгөний тооцоо</h3>
          {zReport.reconciliation ? (
            <div className="mb-2 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-3">
              <Info label="Тооцоолсон" value={`${formatMnt(zReport.reconciliation.expectedCashMnt, { symbol: false })} ₮`} />
              <Info label="Тоолсон" value={`${formatMnt(zReport.reconciliation.countedCashMnt, { symbol: false })} ₮`} />
              <Info
                label="Зөрүү"
                value={`${formatMnt(zReport.reconciliation.varianceMnt, { symbol: false })} ₮`}
                danger={BigInt(zReport.reconciliation.varianceMnt) !== 0n}
              />
              {zReport.reconciliation.note && <Info label="Тэмдэглэл" value={zReport.reconciliation.note} />}
            </div>
          ) : (
            <p className="mb-2 rounded-xl border border-dashed bg-card px-3 py-4 text-center text-sm text-muted-foreground">Тооцоо хийгдээгүй (ээлж хаагдаагүй)</p>
          )}
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
function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${danger ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  );
}
