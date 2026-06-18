'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, ClipboardList, Fuel, Package, Receipt, RotateCcw, User } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, SALE_STATUS_LABEL } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type SaleDetail, type SaleListItem, type StationDto } from '@/lib/pos-api';

function monthRange(): { from: string; to: string } {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  const from = new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return { from, to: ub.toISOString().slice(0, 10) };
}

const STATUS_CLS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-700',
  REFUNDED: 'bg-amber-500/15 text-amber-700',
  VOIDED: 'bg-destructive/15 text-destructive',
};

export default function SalesHistoryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [range, setRange] = useState(monthRange());
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: SaleListItem[]; total: number; totalPages: number } | null>(null);
  const [sel, setSel] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await posApi.listSales({
        stationId: stationId || undefined,
        from: range.from,
        to: range.to,
        status: status || undefined,
        method: method || undefined,
        search: search || undefined,
        page,
        pageSize: 20,
      });
      setData(res);
    } catch (e) {
      if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
      else setError(e instanceof ApiException ? e.error.message : 'Ачаалахад алдаа гарлаа');
    }
  }, [stationId, range, status, method, search, page, router]);

  useEffect(() => {
    if (ready) void reload();
  }, [ready, reload]);

  const openSale = useCallback(async (id: string) => {
    setMsg(null);
    setError(null);
    try {
      setSel(await posApi.getSale(id));
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Дэлгэрэнгүй ачаалахад алдаа гарлаа');
    }
  }, []);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <BackLink href="/reports" />
      <header className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <ClipboardList size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Борлуулалтын түүх</h1>
          <p className="text-sm text-muted-foreground">Гүйлгээ бүрийн дэлгэрэнгүй, буцаалт / цуцлалт</p>
        </div>
      </header>

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <select value={stationId} onChange={(e) => { setStationId(e.target.value); setPage(1); }} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
          <option value="">Бүх салбар</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
        <input type="date" value={range.from} onChange={(e) => { setRange((r) => ({ ...r, from: e.target.value })); setPage(1); }} className="min-h-touch rounded-xl border bg-background px-3 text-sm" />
        <input type="date" value={range.to} onChange={(e) => { setRange((r) => ({ ...r, to: e.target.value })); setPage(1); }} className="min-h-touch rounded-xl border bg-background px-3 text-sm" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
          <option value="">Бүх төлөв</option>
          <option value="COMPLETED">Дууссан</option>
          <option value="REFUNDED">Буцаагдсан</option>
          <option value="VOIDED">Цуцлагдсан</option>
        </select>
        <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
          <option value="">Бүх төлбөр</option>
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
        </select>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Хайх (баримт/харилцагч)" className="min-h-touch flex-1 rounded-xl border bg-background px-3 text-sm" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,420px)]">
        {/* Жагсаалт */}
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Цаг</th>
                <th className="px-3 py-2 font-medium">Кассчин</th>
                <th className="px-3 py-2 font-medium">Төлбөр</th>
                <th className="px-3 py-2 text-right font-medium">Дүн</th>
                <th className="px-3 py-2 text-center font-medium">Төлөв</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.map((s) => (
                <tr key={s.id} onClick={() => openSale(s.id)} className={`cursor-pointer transition hover:bg-accent ${sel?.id === s.id ? 'bg-accent' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(s.soldAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {s.customerName && <span className="block text-xs text-muted-foreground">{s.customerName}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.cashierName ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.methods.map((m) => PAYMENT_METHOD_LABEL[m.method]).join(', ')}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMnt(s.totalMnt, { symbol: false })}</td>
                  <td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[s.status] ?? ''}`}>{SALE_STATUS_LABEL[s.status as keyof typeof SALE_STATUS_LABEL] ?? s.status}</span></td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground"><div className="grid place-items-center"><Receipt size={24} className="mb-1.5 opacity-40" />Борлуулалт олдсонгүй</div></td></tr>
              )}
            </tbody>
          </table>
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Өмнөх</button>
              <span className="text-muted-foreground">{page} / {data.totalPages} · {data.total} гүйлгээ</span>
              <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Дараах</button>
            </div>
          )}
        </section>

        {/* Дэлгэрэнгүй */}
        <section>
          {sel ? (
            <SaleDetailPanel sale={sel} onChanged={async () => { await openSale(sel.id); await reload(); }} onMsg={setMsg} onErr={setError} />
          ) : (
            <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
              <Receipt size={26} className="mb-2 opacity-40" />
              Гүйлгээ сонгож дэлгэрэнгүй харна уу
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SaleDetailPanel({ sale, onChanged, onMsg, onErr }: { sale: SaleDetail; onChanged: () => Promise<void>; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [mode, setMode] = useState<'view' | 'refund' | 'void'>('view');
  const [reason, setReason] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [tenderMethod, setTenderMethod] = useState<string>(sale.payments[0]?.method ?? 'CASH');
  const [busy, setBusy] = useState(false);

  const canAct = sale.status === 'COMPLETED' || sale.status === 'REFUNDED';

  // Буцаах боломжтой нийт дүн (сонгосон тоо хэмжээгээр)
  let refundTotal = 0n;
  for (const l of sale.lines) {
    const q = qtys[l.id];
    if (q && Number(q) > 0) {
      const unit = BigInt(l.unitPriceMnt);
      const milli = Math.round(Number(q) * 1000);
      refundTotal += (unit * BigInt(milli)) / 1000n;
    }
  }

  async function submitRefund() {
    const items = sale.lines
      .filter((l) => qtys[l.id] && Number(qtys[l.id]) > 0)
      .map((l) => ({ saleLineId: l.id, quantity: qtys[l.id]! }));
    if (items.length === 0) { onErr('Буцаах мөр сонгоно уу'); return; }
    if (reason.trim().length < 3) { onErr('Шалтгаан дор хаяж 3 тэмдэгт'); return; }
    setBusy(true);
    try {
      await posApi.refund(sale.id, { reason, items, tenders: [{ method: tenderMethod, amount: refundTotal.toString() }] });
      onMsg('Буцаалт амжилттай — нөөц сэргэлээ');
      setMode('view'); setReason(''); setQtys({});
      await onChanged();
    } catch (e) {
      onErr(e instanceof ApiException ? e.error.message : 'Буцаалт амжилтгүй');
    } finally { setBusy(false); }
  }

  async function submitVoid() {
    if (reason.trim().length < 3) { onErr('Шалтгаан дор хаяж 3 тэмдэгт'); return; }
    setBusy(true);
    try {
      await posApi.voidSale(sale.id, { reason });
      onMsg('Борлуулалт цуцлагдлаа — нөөц сэргэлээ');
      setMode('view'); setReason('');
      await onChanged();
    } catch (e) {
      onErr(e instanceof ApiException ? e.error.message : 'Цуцлалт амжилтгүй');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Борлуулалт{sale.saleNumber ? ` #${sale.saleNumber}` : ''}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{new Date(sale.soldAt).toLocaleString('mn-MN')}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[sale.status] ?? ''}`}>{SALE_STATUS_LABEL[sale.status as keyof typeof SALE_STATUS_LABEL] ?? sale.status}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground"><User size={14} /> Кассчин</div>
        <div className="text-right">{sale.cashierName ?? '—'}</div>
        {sale.customerName && (<><div className="text-muted-foreground">Харилцагч</div><div className="text-right">{sale.customerName}</div></>)}
        {sale.stationLabel && (<><div className="text-muted-foreground">Салбар</div><div className="text-right">{sale.stationLabel}</div></>)}
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Бараа / Түлш</h3>
        <ul className="divide-y text-sm">
          {sale.lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5">
                {l.type === 'FUEL' ? <Fuel size={14} className="shrink-0 text-blue-500" /> : <Package size={14} className="shrink-0 text-muted-foreground" />}
                <span className="truncate">{l.description}</span>
                <span className="shrink-0 text-xs text-muted-foreground">× {l.quantity}</span>
                {Number(l.refundedQty) > 0 && <span className="shrink-0 text-xs text-amber-600">(буцаасан {l.refundedQty})</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatMnt(l.lineTotalMnt, { symbol: false })}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>НӨАТ (10%)</span><span className="tabular-nums">{formatMnt(sale.vatMnt, { symbol: false })}</span></div>
        <div className="flex justify-between font-semibold"><span>Нийт</span><span className="tabular-nums">{formatMnt(sale.totalMnt)}</span></div>
        {sale.payments.map((p, i) => (
          <div key={i} className="flex justify-between text-xs text-muted-foreground"><span>{PAYMENT_METHOD_LABEL[p.method]}</span><span className="tabular-nums">{formatMnt(p.amountMnt, { symbol: false })}</span></div>
        ))}
      </div>

      {sale.refunds.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 p-3 text-sm">
          <h3 className="mb-1 flex items-center gap-1.5 font-medium text-amber-700"><RotateCcw size={14} /> Буцаалт</h3>
          <ul className="space-y-1">
            {sale.refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('mn-MN')} · {r.reason}</span>
                <span className="font-medium tabular-nums text-amber-700">{formatMnt(r.amountMnt, { symbol: false })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Үйлдлүүд */}
      {canAct && mode === 'view' && (
        <div className="flex gap-2">
          <button onClick={() => setMode('refund')} className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium shadow-sm transition hover:bg-accent"><RotateCcw size={15} /> Буцаалт</button>
          {sale.status === 'COMPLETED' && sale.refunds.length === 0 && (
            <button onClick={() => setMode('void')} className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-sm font-medium text-destructive shadow-sm transition hover:bg-destructive/10"><Ban size={15} /> Цуцлах</button>
          )}
        </div>
      )}

      {mode === 'refund' && (
        <div className="space-y-3 rounded-xl border p-3">
          <h3 className="text-sm font-semibold">Буцаах мөр (нөөц сэргэнэ)</h3>
          {sale.lines.map((l) => {
            const remaining = Number(l.quantity) - Number(l.refundedQty);
            return (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{l.description} <span className="text-xs text-muted-foreground">(үлд. {remaining})</span></span>
                <input
                  value={qtys[l.id] ?? ''}
                  onChange={(e) => setQtys((q) => ({ ...q, [l.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={remaining <= 0}
                  className="min-h-touch w-24 rounded-lg border bg-background px-2 text-right text-sm disabled:opacity-40"
                />
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold"><span>Буцаах дүн</span><span className="tabular-nums">{formatMnt(refundTotal.toString())}</span></div>
          <select value={tenderMethod} onChange={(e) => setTenderMethod(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm">
            {sale.payments.map((p) => <option key={p.method} value={p.method}>{PAYMENT_METHOD_LABEL[p.method]}-ээр буцаах</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Шалтгаан" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <div className="flex gap-2">
            <button onClick={submitRefund} disabled={busy || refundTotal <= 0n} className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Буцаах</button>
            <button onClick={() => { setMode('view'); setQtys({}); setReason(''); }} className="min-h-touch rounded-xl border px-3 text-sm">Болих</button>
          </div>
        </div>
      )}

      {mode === 'void' && (
        <div className="space-y-3 rounded-xl border border-destructive/40 p-3">
          <h3 className="text-sm font-semibold text-destructive">Борлуулалт цуцлах (бүх нөөц сэргэнэ)</h3>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Цуцлах шалтгаан" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <div className="flex gap-2">
            <button onClick={submitVoid} disabled={busy} className="inline-flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Цуцлах</button>
            <button onClick={() => { setMode('view'); setReason(''); }} className="min-h-touch rounded-xl border px-3 text-sm">Болих</button>
          </div>
        </div>
      )}
    </div>
  );
}
