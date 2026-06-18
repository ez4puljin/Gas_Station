'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { PrintableReport } from '@/components/printable-report';
import { formatMnt } from '@fuel/schemas';
import { CUSTOMER_TXN_LABEL, type CustomerTxnType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type Customer, customersApi, type Ledger } from '@/lib/customers-api';
import { exportXlsx } from '@/lib/export-xlsx';

function monthRange(): { from: string; to: string } {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  const y = ub.getUTCFullYear();
  const m = ub.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = ub.toISOString().slice(0, 10);
  return { from, to };
}

function balLabel(mnt: string): string {
  const v = BigInt(mnt);
  if (v > 0n) return `Авлага ${formatMnt(v, { symbol: false })}`;
  if (v < 0n) return `Өглөг ${formatMnt(-v, { symbol: false })}`;
  return '0';
}

export default function LedgerReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Customer | null>(null);
  const [range, setRange] = useState(monthRange());
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const reloadCustomers = useCallback(async (q: string) => {
    const list = await customersApi.list(q);
    setCustomers(list);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    reloadCustomers('')
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Харилцагч ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router, reloadCustomers]);

  const load = useCallback(async (id: string, from: string, to: string) => {
    setError(null);
    try {
      setLedger(await customersApi.ledger(id, from, to));
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
      setLedger(null);
    }
  }, []);

  useEffect(() => {
    if (sel && range.from && range.to) void load(sel.id, range.from, range.to);
  }, [sel, range, load]);

  async function doExport() {
    if (!ledger) return;
    setExporting(true);
    try {
      await exportXlsx(`avlaga-uglug-${ledger.customer.name}-${ledger.from}`, [
        {
          name: 'Авлага-өглөг',
          title: 'Авлага өглөгийн тайлан',
          meta: [
            ledger.companyName ?? '',
            `Харилцагч: ${ledger.customer.name}${ledger.customer.regNo ? ` (${ledger.customer.regNo})` : ''}`,
            `Хугацаа: ${ledger.from} — ${ledger.to}`,
            `Эхний үлдэгдэл: ${ledger.openingMnt}`,
          ],
          columns: [
            { header: 'Огноо', key: 'date', width: 20 },
            { header: 'Гүйлгээ', key: 'type', width: 18 },
            { header: 'Баримт', key: 'ref', width: 16 },
            { header: 'Тайлбар', key: 'note', width: 24 },
            { header: 'Дебет', key: 'debit', money: true, width: 16 },
            { header: 'Кредит', key: 'credit', money: true, width: 16 },
            { header: 'Үлдэгдэл', key: 'balance', money: true, width: 18 },
          ],
          rows: ledger.entries.map((e) => ({
            date: new Date(e.createdAt).toLocaleString('mn-MN'),
            type: CUSTOMER_TXN_LABEL[e.type as CustomerTxnType] ?? e.type,
            ref: e.saleNumber ?? '',
            note: e.reason ?? (e.method ?? ''),
            debit: e.debitMnt,
            credit: e.creditMnt,
            balance: e.balanceAfterMnt,
          })),
          totals: { type: 'НИЙТ', debit: ledger.totalDebitMnt, credit: ledger.totalCreditMnt, balance: ledger.closingMnt },
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Авлага-өглөгийн дэвтэр</h1>
          <p className="text-sm text-muted-foreground">Харилцагчийн эхний/эцсийн үлдэгдэл, дебет/кредит</p>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  void reloadCustomers(e.target.value);
                }}
                placeholder="Харилцагч хайх"
                className="min-h-touch w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
              />
            </div>
            <ul className="-mr-1 max-h-72 space-y-1 overflow-auto pr-1">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSel(c)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-accent ${sel?.id === c.id ? 'bg-accent' : ''}`}
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{balLabel(c.balanceMnt)}</span>
                  </button>
                </li>
              ))}
              {customers.length === 0 && (
                <li className="grid place-items-center py-6 text-center text-sm text-muted-foreground">
                  <Users size={22} className="mb-1 opacity-40" />
                  Алга
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-4 shadow-sm">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Эхлэх</span>
              <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Дуусах</span>
              <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm" />
            </label>
          </div>
        </div>
      </div>

      {!sel ? (
        <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
          <Users size={28} className="mb-2 opacity-40" />
          Харилцагч сонгоно уу
        </div>
      ) : ledger ? (
        <PrintableReport
          title="Авлага өглөгийн тайлан"
          companyName={ledger.companyName}
          rangeLabel={`${ledger.from} — ${ledger.to}`}
          metaLines={[`Харилцагч: ${ledger.customer.name}${ledger.customer.regNo ? ` · ${ledger.customer.regNo}` : ''}${ledger.customer.phone ? ` · ${ledger.customer.phone}` : ''}`]}
          onExportXlsx={doExport}
          exporting={exporting}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Огноо</th>
                <th className="py-2 pr-2 font-medium">Гүйлгээ</th>
                <th className="py-2 pr-2 font-medium">Баримт</th>
                <th className="py-2 pr-2 text-right font-medium">Дебет</th>
                <th className="py-2 pr-2 text-right font-medium">Кредит</th>
                <th className="py-2 text-right font-medium">Үлдэгдэл</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr className="bg-muted/40 font-medium">
                <td className="py-2 pr-2" colSpan={3}>Эхний үлдэгдэл</td>
                <td className="py-2 pr-2 text-right tabular-nums">{BigInt(ledger.openingMnt) > 0n ? formatMnt(ledger.openingMnt, { symbol: false }) : ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{BigInt(ledger.openingMnt) < 0n ? formatMnt(-BigInt(ledger.openingMnt), { symbol: false }) : ''}</td>
                <td className="py-2 text-right tabular-nums">{formatMnt(ledger.openingMnt, { symbol: false })}</td>
              </tr>
              {ledger.entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">{new Date(e.createdAt).toLocaleString('mn-MN')}</td>
                  <td className="py-2 pr-2">
                    {CUSTOMER_TXN_LABEL[e.type as CustomerTxnType] ?? e.type}
                    {e.reason && <span className="block text-xs text-muted-foreground">{e.reason}</span>}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">{e.saleNumber ?? '—'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{BigInt(e.debitMnt) > 0n ? formatMnt(e.debitMnt, { symbol: false }) : ''}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{BigInt(e.creditMnt) > 0n ? formatMnt(e.creditMnt, { symbol: false }) : ''}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{formatMnt(e.balanceAfterMnt, { symbol: false })}</td>
                </tr>
              ))}
              {ledger.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">Энэ хугацаанд гүйлгээ алга</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-2" colSpan={3}>НИЙТ ДҮН</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMnt(ledger.totalDebitMnt, { symbol: false })}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMnt(ledger.totalCreditMnt, { symbol: false })}</td>
                <td className="py-2 text-right tabular-nums">{formatMnt(ledger.closingMnt, { symbol: false })}</td>
              </tr>
              <tr className="font-medium text-muted-foreground">
                <td className="py-1 pr-2" colSpan={5}>Эцсийн үлдэгдэл ({BigInt(ledger.closingMnt) >= 0n ? 'авлага' : 'өглөг'})</td>
                <td className="py-1 text-right tabular-nums">{formatMnt(ledger.closingMnt, { symbol: false })} ₮</td>
              </tr>
            </tfoot>
          </table>
        </PrintableReport>
      ) : (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">Ачаалж байна…</div>
      )}
    </main>
  );
}
