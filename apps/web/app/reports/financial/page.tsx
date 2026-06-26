'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { accountingApi, type BalanceSheet, type ProfitLoss, type TrialBalance } from '@/lib/accounting-api';

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}
type Tab = 'pnl' | 'balance' | 'trial';

export default function FinancialReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('pnl');
  const [range, setRange] = useState(monthRange());
  const [pnl, setPnl] = useState<ProfitLoss | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, b, t] = await Promise.all([
        accountingApi.pnl(range),
        accountingApi.balanceSheet({ asOf: range.to }),
        accountingApi.trialBalance(range),
      ]);
      setPnl(p); setBs(b); setTb(t);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа');
    }
  }, [range, router]);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    load().finally(() => setReady(true));
  }, [router, load]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  const fmt = (v: string) => formatMnt(v, { symbol: false });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5"><h1 className="text-2xl font-semibold tracking-tight">Санхүүгийн тайлан</h1>
          <p className="text-sm text-muted-foreground">Орлогын тайлан (P&L), Баланс, Гүйлгээний баланс</p></header>
        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
            {([['pnl', 'Орлого (P&L)'], ['balance', 'Баланс'], ['trial', 'Гүйлгээний баланс']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{l}</button>
            ))}
          </div>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Эхлэх</span>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">{tab === 'balance' ? 'Тайлант огноо' : 'Дуусах'}</span>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
        </div>
      </div>

      {tab === 'pnl' && pnl && (
        <PrintableReport title="Орлогын тайлан (P&L)" rangeLabel={`${pnl.from} — ${pnl.to} (төгрөгөөр)`}>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b bg-muted/40 font-semibold"><td className="px-2 py-1.5" colSpan={2}>Орлого</td></tr>
              {pnl.revenue.map((r) => <tr key={r.code} className="border-b"><td className="px-2 py-1"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.amountMnt)}</td></tr>)}
              <tr className="border-b font-medium"><td className="px-2 py-1.5">Нийт орлого</td><td className="px-2 py-1.5 text-right tabular-nums">{fmt(pnl.totalRevenueMnt)}</td></tr>
              <tr className="border-b bg-muted/40 font-semibold"><td className="px-2 py-1.5" colSpan={2}>Зардал</td></tr>
              {pnl.expense.map((r) => <tr key={r.code} className="border-b"><td className="px-2 py-1"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.amountMnt)}</td></tr>)}
              <tr className="border-b font-medium"><td className="px-2 py-1.5">Нийт зардал</td><td className="px-2 py-1.5 text-right tabular-nums">{fmt(pnl.totalExpenseMnt)}</td></tr>
            </tbody>
            <tfoot><tr className="border-t-2 text-base font-bold"><td className="px-2 py-2">Цэвэр ашиг {BigInt(pnl.netIncomeMnt) < 0n ? '(алдагдал)' : ''}</td><td className={`px-2 py-2 text-right tabular-nums ${BigInt(pnl.netIncomeMnt) < 0n ? 'text-destructive' : 'text-emerald-600'}`}>{fmt(pnl.netIncomeMnt)} ₮</td></tr></tfoot>
          </table>
        </PrintableReport>
      )}

      {tab === 'balance' && bs && (
        <PrintableReport title="Баланс" rangeLabel={`${bs.asOf}-ний байдлаар (төгрөгөөр)`}>
          <div className="grid gap-6 sm:grid-cols-2">
            <table className="w-full self-start text-sm">
              <tbody>
                <tr className="border-b bg-muted/40 font-semibold"><td className="px-2 py-1.5" colSpan={2}>ХӨРӨНГӨ</td></tr>
                {bs.assets.map((r) => <tr key={r.code} className="border-b"><td className="px-2 py-1"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.amountMnt)}</td></tr>)}
              </tbody>
              <tfoot><tr className="border-t-2 font-bold"><td className="px-2 py-2">Нийт хөрөнгө</td><td className="px-2 py-2 text-right tabular-nums">{fmt(bs.totalAssetsMnt)}</td></tr></tfoot>
            </table>
            <table className="w-full self-start text-sm">
              <tbody>
                <tr className="border-b bg-muted/40 font-semibold"><td className="px-2 py-1.5" colSpan={2}>ӨР ТӨЛБӨР</td></tr>
                {bs.liabilities.map((r) => <tr key={r.code} className="border-b"><td className="px-2 py-1"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.amountMnt)}</td></tr>)}
                <tr className="border-b font-medium"><td className="px-2 py-1.5">Нийт өр төлбөр</td><td className="px-2 py-1.5 text-right tabular-nums">{fmt(bs.totalLiabilitiesMnt)}</td></tr>
                <tr className="border-b bg-muted/40 font-semibold"><td className="px-2 py-1.5" colSpan={2}>ӨМЧ</td></tr>
                {bs.equity.map((r) => <tr key={r.code} className="border-b"><td className="px-2 py-1"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.amountMnt)}</td></tr>)}
                <tr className="border-b"><td className="px-2 py-1">Тайлант үеийн ашиг</td><td className="px-2 py-1 text-right tabular-nums">{fmt(bs.netIncomeMnt)}</td></tr>
                <tr className="border-b font-medium"><td className="px-2 py-1.5">Нийт өмч</td><td className="px-2 py-1.5 text-right tabular-nums">{fmt(bs.totalEquityMnt)}</td></tr>
              </tbody>
              <tfoot><tr className="border-t-2 font-bold"><td className="px-2 py-2">Өр төлбөр + Өмч</td><td className="px-2 py-2 text-right tabular-nums">{fmt(bs.totalLiabEquityMnt)}</td></tr></tfoot>
            </table>
          </div>
          <p className={`mt-3 text-sm ${bs.balanced ? 'text-emerald-600' : 'text-destructive'}`}>{bs.balanced ? '✓ Хөрөнгө = Өр + Өмч (тэнцсэн)' : '⚠ Тэнцэхгүй байна'}</p>
        </PrintableReport>
      )}

      {tab === 'trial' && tb && (
        <PrintableReport title="Гүйлгээний баланс" rangeLabel={`${tb.from} — ${tb.to} (төгрөгөөр)`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="px-2 py-2 font-medium">Код</th><th className="px-2 py-2 font-medium">Данс</th><th className="px-2 py-2 text-right font-medium">Дебет</th><th className="px-2 py-2 text-right font-medium">Кредит</th></tr></thead>
            <tbody>
              {tb.rows.map((r) => <tr key={r.code} className="border-b"><td className="px-2 py-1 font-mono text-xs text-muted-foreground">{r.code}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.debitMnt)}</td><td className="px-2 py-1 text-right tabular-nums">{fmt(r.creditMnt)}</td></tr>)}
            </tbody>
            <tfoot><tr className="border-t-2 font-bold"><td className="px-2 py-2" colSpan={2}>НИЙТ</td><td className="px-2 py-2 text-right tabular-nums">{fmt(tb.totalDebitMnt)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(tb.totalCreditMnt)}</td></tr></tfoot>
          </table>
          <p className={`mt-3 text-sm ${tb.balanced ? 'text-emerald-600' : 'text-destructive'}`}>{tb.balanced ? '✓ Дебет = Кредит' : '⚠ Тэнцэхгүй'}</p>
        </PrintableReport>
      )}
    </main>
  );
}
