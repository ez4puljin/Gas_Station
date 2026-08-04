'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, SUPPLIER_TXN_LABEL, type SupplierTxnType } from '@fuel/types';
import { AccountRegisterReport } from '@/components/account-register-report';
import type { LedgerRow } from '@/components/account-ledger-report';
import { BackLink } from '@/components/back-link';
import { ApiException, tokenStore } from '@/lib/api';
import type { AccountRegister } from '@/lib/customers-api';
import { procurementApi } from '@/lib/procurement-api';

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  const y = ub.getUTCFullYear();
  const m = String(ub.getUTCMonth() + 1).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: ub.toISOString().slice(0, 10) };
}

/** Нийлүүлэгчийн өглөгийн НЭГДСЭН тооцооны бүртгэл — бүх нийлүүлэгч нэг хүснэгтэд. */
export default function PayablesRegisterPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [range, setRange] = useState(monthRange);
  const [data, setData] = useState<AccountRegister | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    setReady(true);
  }, [router]);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true); setError(null);
    try { setData(await procurementApi.supplierRegister(from, to)); }
    catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
      setData(null);
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (ready) void load(range.from, range.to); }, [ready, range, load]);

  const loadRows = useCallback(async (partyId: string): Promise<LedgerRow[]> => {
    const l = await procurementApi.supplierLedger(partyId, range.from, range.to);
    return (l.entries ?? []).map((e) => ({
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
    }));
  }, [range.from, range.to]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="no-print">
        <BackLink href="/reports" />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Өглөгийн тооцооны бүртгэл</h1>
          <p className="text-sm text-muted-foreground">Бүх нийлүүлэгчийн эхний үлдэгдэл, гүйлгээ, эцсийн үлдэгдэл</p>
        </header>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Эхлэх</span>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Дуусах</span>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm" />
          </label>
        </div>
        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>

      {loading && !data && <div className="grid place-items-center py-16 text-sm text-muted-foreground">Ачаалж байна…</div>}
      {data && (
        <AccountRegisterReport
          title="Өглөгийн тооцооны бүртгэл"
          fileBase="uglugiin-burtgel"
          accountLabel="Худалдааны өглөг (3100)"
          partyKind="Нийлүүлэгч"
          nature="credit"
          data={data}
          loadRows={loadRows}
        />
      )}
    </main>
  );
}
