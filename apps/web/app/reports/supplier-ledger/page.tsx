'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { AccountLedgerReport, type LedgerRow } from '@/components/account-ledger-report';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, SUPPLIER_TXN_LABEL, type SupplierTxnType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { procurementApi, type Supplier, type SupplierLedger } from '@/lib/procurement-api';

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
  if (v > 0n) return `Өглөг ${formatMnt(v, { symbol: false })}`;
  if (v < 0n) return `Урьдчилгаа ${formatMnt(-v, { symbol: false })}`;
  return '0';
}

export default function SupplierLedgerReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Supplier | null>(null);
  const [range, setRange] = useState(monthRange());
  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    procurementApi
      .suppliers()
      .then(setSuppliers)
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Нийлүүлэгч ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router]);

  const load = useCallback(async (id: string, from: string, to: string) => {
    setError(null);
    try {
      setLedger(await procurementApi.supplierLedger(id, from, to));
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
      setLedger(null);
    }
  }, []);

  useEffect(() => {
    if (sel && range.from && range.to) void load(sel.id, range.from, range.to);
  }, [sel, range, load]);

  const filtered = suppliers.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone ?? '').includes(search),
  );

  const rows: LedgerRow[] = useMemo(
    () =>
      (ledger?.entries ?? []).map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        typeLabel: SUPPLIER_TXN_LABEL[e.type as SupplierTxnType] ?? e.type,
        ref: e.purchaseNo,
        reason: e.reason,
        methodLabel: e.method ? (PAYMENT_METHOD_LABEL[e.method as PaymentMethod] ?? e.method) : null,
        debitMnt: e.debitMnt,
        creditMnt: e.creditMnt,
        balanceAfterMnt: e.balanceAfterMnt,
        items: e.items,
      })),
    [ledger],
  );

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Нийлүүлэгчийн тооцоо (өглөг)</h1>
          <p className="text-sm text-muted-foreground">Нийлүүлэгчийн эхний/эцсийн үлдэгдэл, дебет/кредит, гүйлгээ бүрийн бараа</p>
        </header>

        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Нийлүүлэгч хайх"
                className="min-h-touch w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
              />
            </div>
            <ul className="-mr-1 max-h-72 space-y-1 overflow-auto pr-1">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSel(s)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-accent ${sel?.id === s.id ? 'bg-accent' : ''}`}
                  >
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{balLabel(s.balanceMnt)}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="grid place-items-center py-6 text-center text-sm text-muted-foreground">
                  <Building2 size={22} className="mb-1 opacity-40" />
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
          <Building2 size={28} className="mb-2 opacity-40" />
          Нийлүүлэгч сонгоно уу
        </div>
      ) : ledger ? (
        <AccountLedgerReport
          title="Нийлүүлэгчийн өглөгийн тайлан"
          fileBase={`uglug-${ledger.supplier.name}`}
          companyName={ledger.companyName}
          from={ledger.from}
          to={ledger.to}
          accountLabel="Нийлүүлэгчийн өглөг"
          partyKind="Нийлүүлэгч"
          party={{ name: ledger.supplier.name, regNo: ledger.supplier.regNo, phone: ledger.supplier.phone }}
          nature="credit"
          openingMnt={ledger.openingMnt}
          totalDebitMnt={ledger.totalDebitMnt}
          totalCreditMnt={ledger.totalCreditMnt}
          closingMnt={ledger.closingMnt}
          rows={rows}
        />
      ) : (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">Ачаалж байна…</div>
      )}
    </main>
  );
}
