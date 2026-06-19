'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  HandCoins,
  Phone,
  Plus,
  PowerOff,
  Receipt,
  Search,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { SUPPLIER_TXN_LABEL, type SupplierTxnType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import {
  type Payables,
  procurementApi,
  type Supplier,
  type SupplierTxn,
} from '@/lib/procurement-api';

/** Өглөгийн харагдац: эерэг = бид нийлүүлэгчид төлөх ёстой. */
function payableLabel(mnt: string): { text: string; cls: string } {
  const v = BigInt(mnt);
  if (v > 0n) return { text: `Өглөг: ${formatMnt(v)}`, cls: 'text-destructive' };
  if (v < 0n) return { text: `Урьдчилгаа: ${formatMnt(-v)}`, cls: 'text-emerald-600' };
  return { text: 'Тэг үлдэгдэл', cls: 'text-muted-foreground' };
}

export default function SuppliersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [pay, setPay] = useState<Payables | null>(null);
  const [sel, setSel] = useState<Supplier | null>(null);
  const [txns, setTxns] = useState<SupplierTxn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // forms
  const [nName, setNName] = useState('');
  const [nPhone, setNPhone] = useState('');
  const [nRegNo, setNRegNo] = useState('');
  const [payAmt, setPayAmt] = useState('');
  const [adjAmt, setAdjAmt] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const reload = useCallback(async () => {
    const [l, p] = await Promise.all([
      procurementApi.suppliers(),
      procurementApi.payables().catch(() => null),
    ]);
    setList(l);
    if (p) setPay(p);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router, reload]);

  const open = useCallback(async (id: string) => {
    setError(null);
    setMsg(null);
    const [s, t] = await Promise.all([procurementApi.supplier(id), procurementApi.supplierTxns(id)]);
    setSel(s);
    setTxns(t.items);
  }, []);

  async function createSupplier() {
    if (!nName) return;
    setBusy(true);
    setError(null);
    try {
      const s = await procurementApi.createSupplier({
        name: nName,
        phone: nPhone || undefined,
        regNo: nRegNo || undefined,
      });
      setNName('');
      setNPhone('');
      setNRegNo('');
      await reload();
      await open(s.id);
      setMsg('Нийлүүлэгч нэмэгдлээ');
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
      await procurementApi.pay(sel.id, { amount: payAmt, method: 'TRANSFER' });
      setPayAmt('');
      await open(sel.id);
      await reload();
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
      await procurementApi.adjust(sel.id, { amountMnt: adjAmt, reason: adjReason });
      setAdjAmt('');
      setAdjReason('');
      await open(sel.id);
      await reload();
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
      await procurementApi.updateSupplier(sel.id, { isActive: !sel.isActive });
      await open(sel.id);
      await reload();
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  const filtered = list.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone ?? '').includes(search),
  );

  if (!ready)
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader
        icon={Building2}
        title="Нийлүүлэгч / Өглөг"
        subtitle={pay ? `${pay.count} нийлүүлэгч` : 'Нийлүүлэгчийн өглөг, төлбөр, тооцоо'}
      />

      {pay && (
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Stat label="Нийт өглөг" value={formatMnt(pay.totalPayableMnt)} cls="text-destructive" icon={<Wallet size={16} />} />
          <Stat label="Нийлүүлэгч" value={String(pay.count)} icon={<Building2 size={16} />} />
        </section>
      )}

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Хайх (нэр/утас)"
                className="min-h-touch w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
              />
            </div>
            <ul className="-mr-1 max-h-80 space-y-1 overflow-auto pr-1">
              {filtered.map((s) => {
                const b = payableLabel(s.balanceMnt);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => open(s.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-accent ${sel?.id === s.id ? 'bg-accent' : ''}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{s.name}</span>
                        {!s.isActive && <span className="ml-1 text-xs text-muted-foreground">(идэвхгүй)</span>}
                      </span>
                      <span className={`shrink-0 text-xs font-medium ${b.cls}`}>{formatMnt(s.balanceMnt)}</span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="grid place-items-center py-8 text-center text-sm text-muted-foreground">
                  <Building2 size={24} className="mb-1.5 opacity-40" />
                  Алга
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Plus size={16} className="text-primary" /> Шинэ нийлүүлэгч
            </h2>
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Нэр" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
            <input value={nPhone} onChange={(e) => setNPhone(e.target.value)} placeholder="Утас" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
            <input value={nRegNo} onChange={(e) => setNRegNo(e.target.value)} placeholder="Регистр / ТТД" className="mb-3 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
            <button
              onClick={createSupplier}
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
              <Building2 size={28} className="mb-2 opacity-40" />
              Нийлүүлэгч сонгоно уу
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
                      {sel.regNo && (
                        <>
                          <span className="opacity-50">·</span>
                          Регистр: {sel.regNo}
                        </>
                      )}
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
                <p className={`mt-3 text-2xl font-semibold ${payableLabel(sel.balanceMnt).cls}`}>
                  {payableLabel(sel.balanceMnt).text}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <HandCoins size={16} className="text-emerald-600" /> Төлбөр төлөх
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
                    placeholder="+/- дүн (өглөг)"
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
                        <td className="py-2">{SUPPLIER_TXN_LABEL[t.type as SupplierTxnType]}</td>
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
