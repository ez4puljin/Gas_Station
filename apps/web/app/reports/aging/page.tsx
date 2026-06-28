'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { type AgingReport, customersApi } from '@/lib/customers-api';
import { procurementApi } from '@/lib/procurement-api';

function ubToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
type Tab = 'ar' | 'ap';

export default function AgingReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('ar');
  const [asOf, setAsOf] = useState(ubToday());
  const [ar, setAr] = useState<AgingReport | null>(null);
  const [ap, setAp] = useState<AgingReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, b] = await Promise.all([customersApi.aging(asOf), procurementApi.aging(asOf)]);
      setAr(a);
      setAp(b);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа');
    }
  }, [asOf, router]);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    load().finally(() => setReady(true));
  }, [router, load]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  const data = tab === 'ar' ? ar : ap;
  const partyLabel = tab === 'ar' ? 'Харилцагч' : 'Нийлүүлэгч';
  const title = tab === 'ar' ? 'Авлагын насжилт' : 'Өглөгийн насжилт';
  const fmt = (v: string) => formatMnt(v, { symbol: false });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5"><h1 className="text-2xl font-semibold tracking-tight">Авлага / Өглөгийн насжилт</h1>
          <p className="text-sm text-muted-foreground">Барагдаагүй үлдэгдлийг 0-30 / 31-60 / 61-90 / 90+ хоногоор (FIFO)</p></header>
        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
            {([['ar', 'Авлага (AR)'], ['ap', 'Өглөг (AP)']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{l}</button>
            ))}
          </div>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Тайлант огноо</span>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
        </div>
      </div>

      {data && (
        <PrintableReport title={title} rangeLabel={`${data.asOf}-ний байдлаар (төгрөгөөр)`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">{partyLabel}</th>
                <th className="px-2 py-2 text-right font-medium">0–30</th>
                <th className="px-2 py-2 text-right font-medium">31–60</th>
                <th className="px-2 py-2 text-right font-medium">61–90</th>
                <th className="px-2 py-2 text-right font-medium">90+</th>
                <th className="px-2 py-2 text-right font-medium">Нийт</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="px-2 py-1.5">{r.name}{r.regNo && <span className="ml-1 text-xs text-muted-foreground">{r.regNo}</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.b0_30Mnt)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.b31_60Mnt)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.b61_90Mnt)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${BigInt(r.b90plusMnt) > 0n ? 'font-medium text-destructive' : ''}`}>{fmt(r.b90plusMnt)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(r.totalMnt)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">Барагдаагүй үлдэгдэл алга</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td className="px-2 py-2">НИЙТ</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(data.totals.b0_30Mnt)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(data.totals.b31_60Mnt)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(data.totals.b61_90Mnt)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(data.totals.b90plusMnt)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(data.totals.totalMnt)}</td>
              </tr>
            </tfoot>
          </table>
        </PrintableReport>
      )}
    </main>
  );
}
