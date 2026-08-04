'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CUSTOMER_TXN_LABEL, type CustomerTxnType, PAYMENT_METHOD_LABEL, type PaymentMethod } from '@fuel/types';
import { AccountRegisterReport } from '@/components/account-register-report';
import type { LedgerRow } from '@/components/account-ledger-report';
import { BackLink } from '@/components/back-link';
import { defaultRange, ReportFilters } from '@/components/report-filters';
import { ApiException, tokenStore } from '@/lib/api';
import { type AccountRegister, customersApi } from '@/lib/customers-api';

/** Харилцагчийн авлагын НЭГДСЭН тооцооны бүртгэл — бүх харилцагч нэг хүснэгтэд. */
export default function ReceivablesRegisterPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [range, setRange] = useState(defaultRange);
  const [customerId, setCustomerId] = useState('');
  const [data, setData] = useState<AccountRegister | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    setReady(true);
  }, [router]);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true); setError(null);
    try { setData(await customersApi.register(from, to)); }
    catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Тайлан ачаалахад алдаа гарлаа');
      setData(null);
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (ready) void load(range.from, range.to); }, [ready, range, load]);

  // Мөр задлахад тухайн харилцагчийн гүйлгээг татаж, тайлангийн мөр рүү буулгана.
  const loadRows = useCallback(async (partyId: string): Promise<LedgerRow[]> => {
    const l = await customersApi.ledger(partyId, range.from, range.to);
    return (l.entries ?? []).map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      typeLabel: CUSTOMER_TXN_LABEL[e.type as CustomerTxnType] ?? e.type,
      ref: e.saleNumber,
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
          <h1 className="text-2xl font-semibold tracking-tight">Авлагын тооцооны бүртгэл</h1>
          <p className="text-sm text-muted-foreground">Бүх харилцагчийн эхний үлдэгдэл, гүйлгээ, эцсийн үлдэгдэл</p>
        </header>
        <ReportFilters range={range} onRange={setRange} customerId={customerId} onCustomer={setCustomerId} />
        {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>

      {loading && !data && <div className="grid place-items-center py-16 text-sm text-muted-foreground">Ачаалж байна…</div>}
      {data && (
        <AccountRegisterReport
          title="Авлагын тооцооны бүртгэл"
          fileBase="avlagiin-burtgel"
          accountLabel="Худалдааны авлага (1200)"
          partyKind="Харилцагч"
          nature="debit"
          data={data}
          partyId={customerId || undefined}
          loadRows={loadRows}
        />
      )}
    </main>
  );
}
