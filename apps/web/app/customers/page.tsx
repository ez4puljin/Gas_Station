'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  CheckCircle2,
  HandCoins,
  Phone,
  Plus,
  PowerOff,
  Receipt,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { CUSTOMER_TXN_LABEL, type CustomerTxnType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type Customer, type CustomerTxn, customersApi, type Receivables } from '@/lib/customers-api';

function balanceLabel(mnt: string): { text: string; cls: string } {
  const v = BigInt(mnt);
  if (v > 0n) return { text: `Авлага: ${formatMnt(v)}`, cls: 'text-destructive' };
  if (v < 0n) return { text: `Өглөг: ${formatMnt(-v)}`, cls: 'text-emerald-600' };
  return { text: `Тэг үлдэгдэл`, cls: 'text-muted-foreground' };
}

export default function CustomersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [recv, setRecv] = useState<Receivables | null>(null);
  const [sel, setSel] = useState<Customer | null>(null);
  const [txns, setTxns] = useState<CustomerTxn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // forms
  const [nName, setNName] = useState('');
  const [nPhone, setNPhone] = useState('');
  const [nLimit, setNLimit] = useState('0');
  const [payAmt, setPayAmt] = useState('');
  const [adjAmt, setAdjAmt] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const reloadList = useCallback(async (q: string) => {
    const [l, r] = await Promise.all([customersApi.list(q), customersApi.receivables().catch(() => null)]);
    setList(l);
    if (r) setRecv(r);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    reloadList('')
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router, reloadList]);

  const openCustomer = useCallback(async (id: string) => {
    setError(null);
    setMsg(null);
    const [c, t] = await Promise.all([customersApi.get(id), customersApi.transactions(id)]);
    setSel(c);
    setTxns(t.items);
  }, []);

  async function createCustomer() {
    if (!nName) return;
    setBusy(true);
    setError(null);
    try {
      const c = await customersApi.create({ name: nName, phone: nPhone || undefined, creditLimitMnt: nLimit || '0' });
      setNName('');
      setNPhone('');
      setNLimit('0');
      await reloadList(search);
      await openCustomer(c.id);
      setMsg('Харилцагч нэмэгдлээ');
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function doPay() {
    if (!sel || !payAmt) return;
    setBusy(true);
    setError(null);
    try {
      await customersApi.pay(sel.id, { amount: payAmt, method: 'CASH' });
      setPayAmt('');
      await openCustomer(sel.id);
      await reloadList(search);
      setMsg('Төлбөр бүртгэгдлээ');
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function doAdjust() {
    if (!sel || !adjAmt || adjReason.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await customersApi.adjust(sel.id, { amountMnt: adjAmt, reason: adjReason });
      setAdjAmt('');
      setAdjReason('');
      await openCustomer(sel.id);
      await reloadList(search);
      setMsg('Засвар хийгдлээ');
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!sel) return;
    setBusy(true);
    try {
      await customersApi.update(sel.id, { isActive: !sel.isActive });
      await openCustomer(sel.id);
      await reloadList(search);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-8">
      <PageHeader
        icon={Users}
        title="Харилцагч / Авлага"
        subtitle={recv ? `${recv.count} харилцагч` : 'Харилцагчийн авлага, өглөг, тооцоо'}
      />

      {recv && (
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Нийт авлага" value={formatMnt(recv.totalReceivableMnt)} cls="text-destructive" icon={<HandCoins size={16} />} />
          <Stat label="Нийт өглөг" value={formatMnt(recv.totalPayableMnt)} cls="text-emerald-600" icon={<Wallet size={16} />} />
          <Stat label="Харилцагч" value={String(recv.count)} icon={<Users size={16} />} />
        </section>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {msg && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={15} /> {msg}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Жагсаалт + шинэ */}
        <section className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  void reloadList(e.target.value);
                }}
                placeholder="Хайх (нэр/утас)"
                className="min-h-touch w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
              />
            </div>
            <ul className="-mr-1 max-h-80 space-y-1 overflow-auto pr-1">
              {list.map((c) => {
                const b = balanceLabel(c.balanceMnt);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => openCustomer(c.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-accent ${sel?.id === c.id ? 'bg-accent' : ''}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{c.name}</span>
                        {!c.isActive && <span className="ml-1 text-xs text-muted-foreground">(идэвхгүй)</span>}
                      </span>
                      <span className={`shrink-0 text-xs font-medium ${b.cls}`}>{formatMnt(c.balanceMnt)}</span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && (
                <li className="grid place-items-center py-8 text-center text-sm text-muted-foreground">
                  <Users size={24} className="mb-1.5 opacity-40" />
                  Алга
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Plus size={16} className="text-primary" /> Шинэ харилцагч
            </h2>
            <input
              value={nName}
              onChange={(e) => setNName(e.target.value)}
              placeholder="Нэр"
              className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm"
            />
            <input
              value={nPhone}
              onChange={(e) => setNPhone(e.target.value)}
              placeholder="Утас"
              className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm"
            />
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Зээлийн лимит (₮, 0=лимитгүй)</label>
            <input
              value={nLimit}
              onChange={(e) => setNLimit(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              className="mb-3 min-h-touch w-full rounded-xl border bg-background px-3 text-sm"
            />
            <button
              onClick={createCustomer}
              disabled={busy || !nName}
              className="inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              <Plus size={16} /> Нэмэх
            </button>
          </div>
        </section>

        {/* Дэлгэрэнгүй */}
        <section>
          {!sel ? (
            <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
              <Users size={28} className="mb-2 opacity-40" />
              Харилцагч сонгоно уу
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight">{sel.name}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                      <Phone size={13} className="opacity-70" />
                      {sel.phone ?? '—'}
                      <span className="opacity-50">·</span>
                      Лимит: {Number(sel.creditLimitMnt) === 0 ? 'хязгааргүй' : formatMnt(sel.creditLimitMnt)}
                    </p>
                  </div>
                  <button
                    onClick={toggleActive}
                    disabled={busy}
                    className="inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm transition hover:bg-accent disabled:opacity-50"
                  >
                    {sel.isActive ? <PowerOff size={15} /> : <CheckCircle2 size={15} />}
                    {sel.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                  </button>
                </div>
                <p className={`mt-3 text-2xl font-semibold ${balanceLabel(sel.balanceMnt).cls}`}>
                  {balanceLabel(sel.balanceMnt).text}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <HandCoins size={16} className="text-emerald-600" /> Төлбөр авах
                  </h3>
                  <input
                    value={payAmt}
                    onChange={(e) => setPayAmt(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    placeholder="Дүн (₮)"
                    className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm"
                  />
                  <button
                    onClick={doPay}
                    disabled={busy || !payAmt}
                    className="inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"
                  >
                    <HandCoins size={16} /> Бүртгэх
                  </button>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ArrowLeftRight size={16} className="text-primary" /> Гар засвар
                  </h3>
                  <input
                    value={adjAmt}
                    onChange={(e) => setAdjAmt(e.target.value.replace(/[^\d-]/g, ''))}
                    inputMode="numeric"
                    placeholder="+/- дүн"
                    className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm"
                  />
                  <input
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    placeholder="Шалтгаан"
                    className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm"
                  />
                  <button
                    onClick={doAdjust}
                    disabled={busy || !adjAmt || adjReason.length < 3}
                    className="inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"
                  >
                    <ArrowLeftRight size={16} /> Засах
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Receipt size={16} className="text-muted-foreground" /> Тооцооны хуулга
                </h3>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Огноо</th>
                      <th className="pb-2 font-medium">Төрөл</th>
                      <th className="pb-2 text-right font-medium">Дүн</th>
                      <th className="pb-2 text-right font-medium">Үлдэгдэл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="py-2">{new Date(t.createdAt).toLocaleString('mn-MN')}</td>
                        <td className="py-2">{CUSTOMER_TXN_LABEL[t.type as CustomerTxnType]}</td>
                        <td className={`py-2 text-right font-medium ${BigInt(t.amountMnt) >= 0n ? 'text-destructive' : 'text-emerald-600'}`}>
                          {formatMnt(t.amountMnt)}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">{formatMnt(t.balanceAfterMnt)}</td>
                      </tr>
                    ))}
                    {txns.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          <div className="grid place-items-center">
                            <Receipt size={24} className="mb-1.5 opacity-40" />
                            Гүйлгээ алга
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, cls, icon }: { label: string; value: string; cls?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${cls ?? ''}`}>{value}</div>
    </div>
  );
}
