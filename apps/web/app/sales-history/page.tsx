'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Coins, Filter, Fuel, Package, Receipt, X } from 'lucide-react';
import { DateRangePicker, type DateRange } from '@/components/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { formatMnt } from '@fuel/schemas';
import {
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
  SALE_STATUS_LABEL,
  type SaleStatus,
} from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type SaleDetail, type SaleListItem, type StationDto } from '@/lib/pos-api';

/** Толгойд харуулах төлбөрийн хэлбэрүүд (баганын дараалал). */
const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'MOBILE', 'FUEL_CARD', 'CREDIT'];
/** API-ийн pageSize-ийн дээд хязгаар (`packages/schemas`-д тогтоосон). */
const PAGE_SIZE = 200;

function ubToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function methodAmount(sale: SaleListItem, m: PaymentMethod): bigint {
  return sale.methods.reduce((a, x) => (x.method === m ? a + BigInt(x.amountMnt) : a), 0n);
}

/** Огноо/цаг — Asia/Ulaanbaatar, 24 цаг (CLAUDE.md §8). 'mn-MN' fallback нь гадаад формат
 *  (6/17/2026, 2:30 AM) өгдөг тул хэсгүүдээс гараар угсарна. */
function ubDateTime(iso: string, withDate = true): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ulaanbaatar',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  const time = `${p.hour}:${p.minute}`;
  return withDate ? `${p.year}/${p.month}/${p.day} ${time}` : time;
}

export default function SalesHistoryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [range, setRange] = useState<DateRange>(() => {
    const t = ubToday();
    return { from: t, to: t };
  });
  const [sales, setSales] = useState<SaleListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Баганаар филтер (client-side)
  const [fNumber, setFNumber] = useState('');
  const [fCashier, setFCashier] = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fMethod, setFMethod] = useState<PaymentMethod | ''>(''); // төлбөрийн хэлбэрээр шүүх

  // Сонгосон борлуулалтын дэлгэрэнгүй (модал)
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    posApi
      .stations()
      .then((list) => {
        setStations(list);
        if (list.length > 0) setStationId(list[0]!.id);
        setReady(true);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Салбар ачаалахад алдаа гарлаа');
        setReady(true);
      });
  }, [router]);

  /** Тухайн өдрийн бүх борлуулалтыг хуудаслан татна (>200 байсан ч бүгдийг). */
  const reload = useCallback(async () => {
    if (!stationId) {
      setSales([]);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const all: SaleListItem[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const r = await posApi.listSales({
          stationId,
          from: range.from,
          to: range.to,
          page,
          pageSize: PAGE_SIZE,
        });
        all.push(...r.items);
        totalPages = r.totalPages;
        page++;
      } while (page <= totalPages && all.length < 5000); // safety cap
      setSales(all);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Ачаалахад алдаа гарлаа');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [stationId, range]);

  useEffect(() => {
    if (ready) void reload();
  }, [ready, reload]);

  // Уникальр сонголтуудыг dropdown-д ашиглах
  const uniqueCashiers = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sales ?? []) if (s.cashierId && s.cashierName) m.set(s.cashierId, s.cashierName);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'mn'));
  }, [sales]);
  const uniqueCustomers = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sales ?? []) if (s.customerId && s.customerName) m.set(s.customerId, s.customerName);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'mn'));
  }, [sales]);

  // Баганын филтер хэрэгжүүлсний дараах жагсаалт + нийт. Customer-ийн "—" сонголт = харилцагчгүй гүйлгээ.
  const filteredSales = useMemo(() => {
    const q = fNumber.trim().toLowerCase();
    return (sales ?? []).filter((s) => {
      if (q && !(s.saleNumber ?? '').toLowerCase().includes(q)) return false;
      if (fCashier && s.cashierId !== fCashier) return false;
      if (fCustomer === '__NONE__' ? s.customerId !== null : fCustomer && s.customerId !== fCustomer) return false;
      if (fStatus && s.status !== fStatus) return false;
      if (fMethod && methodAmount(s, fMethod) === 0n) return false; // тухайн төлбөрийн хэлбэр оролцсон гүйлгээ
      return true;
    });
  }, [sales, fNumber, fCashier, fCustomer, fStatus, fMethod]);

  /** Цуцлагдсан гүйлгээ нь буцаагдсан мөнгө тул нийтэд ороохгүй (finance-ийн `grossMnt`-тэй нийцэх). */
  const totals = useMemo(() => {
    const perMethod: Record<PaymentMethod, bigint> = {
      CASH: 0n, CARD: 0n, FUEL_CARD: 0n, MOBILE: 0n, TRANSFER: 0n, CREDIT: 0n,
    };
    let grand = 0n;
    let txnCount = 0;
    for (const s of filteredSales) {
      if (s.status === 'VOIDED') continue;
      txnCount++;
      grand += BigInt(s.totalMnt);
      for (const m of METHODS) perMethod[m] += methodAmount(s, m);
    }
    return { perMethod, grand, txnCount };
  }, [filteredSales]);

  async function openDetail(id: string) {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await posApi.getSale(id));
    } catch (e) {
      setDetailError(e instanceof ApiException ? e.error.message : 'Дэлгэрэнгүй ачаалахад алдаа гарлаа');
    } finally {
      setDetailLoading(false);
    }
  }

  if (!ready) {
    return <main className="grid min-h-[60vh] place-items-center text-muted-foreground">Ачаалж байна…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-6">
      <PageHeader
        icon={ClipboardList}
        title="Борлуулалтын түүх"
        subtitle="Сонгосон салбар, хугацааны борлуулалт — төлбөрийн хэлбэрээр"
      >
        <DateRangePicker value={range} today={ubToday()} onChange={setRange} />
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="min-h-touch rounded-xl border bg-card px-3 text-sm shadow-sm"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
          ))}
        </select>
      </PageHeader>

      {error && (
        <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Нийт орлого + төлбөрийн задаргаа */}
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-lg shadow-blue-500/25">
          <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/90">Нийт орлого</span>
              <Coins size={16} className="text-white/80" />
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums">
              {formatMnt(totals.grand.toString())}
            </div>
            <div className="mt-0.5 text-[11px] text-white/80">{totals.txnCount} гүйлгээ</div>
          </div>
        </div>
        {METHODS.map((m) => {
          const active = fMethod === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setFMethod(active ? '' : m)}
              title={`${PAYMENT_METHOD_LABEL[m]}-ээр шүүх`}
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                active
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/40'
                  : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[m]}</span>
                <Filter size={12} className={active ? 'text-primary' : 'text-muted-foreground/40'} />
              </div>
              <div className="mt-2 text-lg font-bold tabular-nums tracking-tight">
                {formatMnt(totals.perMethod[m].toString())}
              </div>
            </button>
          );
        })}
      </section>

      {/* Идэвхтэй төлбөрийн шүүлт */}
      {fMethod && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm">
          <Filter size={14} className="text-primary" />
          <span>
            Төлбөр: <span className="font-semibold">{PAYMENT_METHOD_LABEL[fMethod]}</span>-ээр шүүсэн
          </span>
          <button
            onClick={() => setFMethod('')}
            className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Цэвэрлэх"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Гүйлгээний хүснэгт */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {sales === null || loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Ачаалж байна…</p>
        ) : sales.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Энэ хугацаанд борлуулалт алга</p>
        ) : filteredSales.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Шүүлтэд тохирох гүйлгээ алга
            <button
              onClick={() => { setFNumber(''); setFCashier(''); setFCustomer(''); setFStatus(''); setFMethod(''); }}
              className="ml-2 rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
            >
              Цэвэрлэх
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Огноо/Цаг</th>
                  <th className="px-3 py-2.5 font-medium">Кассчин</th>
                  <th className="px-3 py-2.5 font-medium">Харилцагч</th>
                  {METHODS.map((m) => {
                    const active = fMethod === m;
                    return (
                      <th key={m} className="px-1 py-2.5 text-right font-medium">
                        <button
                          type="button"
                          onClick={() => setFMethod(active ? '' : m)}
                          title={`${PAYMENT_METHOD_LABEL[m]}-ээр шүүх`}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${active ? 'bg-primary/15 text-primary' : 'hover:bg-accent hover:text-foreground'}`}
                        >
                          {PAYMENT_METHOD_LABEL[m]}
                          {active && <Filter size={10} />}
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2.5 font-medium">Төлөв</th>
                  <th className="px-3 py-2.5 text-right font-medium">Нийт</th>
                </tr>
                {/* Баганаар филтер хийх мөр */}
                <tr className="border-b bg-card">
                  <th className="px-2 py-2">
                    <input
                      value={fNumber}
                      onChange={(e) => setFNumber(e.target.value)}
                      placeholder="Хайх…"
                      className="h-8 w-full rounded-md border bg-background px-2 text-[11px] font-normal outline-none ring-ring focus:ring-2"
                    />
                  </th>
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2">
                    <select
                      value={fCashier}
                      onChange={(e) => setFCashier(e.target.value)}
                      className="h-8 w-full rounded-md border bg-background px-2 text-[11px] font-normal outline-none ring-ring focus:ring-2"
                    >
                      <option value="">Бүгд</option>
                      {uniqueCashiers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-2">
                    <select
                      value={fCustomer}
                      onChange={(e) => setFCustomer(e.target.value)}
                      className="h-8 w-full rounded-md border bg-background px-2 text-[11px] font-normal outline-none ring-ring focus:ring-2"
                    >
                      <option value="">Бүгд</option>
                      <option value="__NONE__">— (харилцагчгүй)</option>
                      {uniqueCustomers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </th>
                  {METHODS.map((m) => (
                    <th key={m} className="px-2 py-2" />
                  ))}
                  <th className="px-2 py-2">
                    <select
                      value={fStatus}
                      onChange={(e) => setFStatus(e.target.value)}
                      className="h-8 w-full rounded-md border bg-background px-2 text-[11px] font-normal outline-none ring-ring focus:ring-2"
                    >
                      <option value="">Бүгд</option>
                      <option value="COMPLETED">Дууссан</option>
                      <option value="REFUNDED">Буцаагдсан</option>
                      <option value="VOIDED">Цуцлагдсан</option>
                    </select>
                  </th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSales.map((s) => {
                  const voided = s.status === 'VOIDED';
                  return (
                    <tr
                      key={s.id}
                      onClick={() => void openDetail(s.id)}
                      className={`cursor-pointer transition-colors ${voided ? 'text-muted-foreground hover:bg-accent/20' : 'hover:bg-accent/40'}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{s.saleNumber ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">
                        {ubDateTime(s.soldAt)}
                      </td>
                      <td className="px-3 py-2">{s.cashierName ?? '—'}</td>
                      <td className="px-3 py-2">{s.customerName ?? '—'}</td>
                      {METHODS.map((m) => {
                        const v = methodAmount(s, m);
                        return (
                          <td key={m} className={`px-3 py-2 text-right tabular-nums ${v === 0n ? 'text-muted-foreground/40' : ''}`}>
                            {v === 0n ? '—' : formatMnt(v.toString())}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            s.status === 'COMPLETED'
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : s.status === 'REFUNDED'
                                ? 'bg-amber-500/15 text-amber-700'
                                : 'bg-rose-500/15 text-rose-700'
                          }`}
                        >
                          {SALE_STATUS_LABEL[s.status as SaleStatus] ?? s.status}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${voided ? 'line-through' : ''}`}>
                        {formatMnt(s.totalMnt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 bg-muted/30 text-sm font-semibold">
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                    Нийт ({totals.txnCount} гүйлгээ)
                  </td>
                  {METHODS.map((m) => (
                    <td key={m} className="px-3 py-3 text-right tabular-nums">
                      {totals.perMethod[m] === 0n ? '—' : formatMnt(totals.perMethod[m].toString())}
                    </td>
                  ))}
                  <td />
                  <td className="px-3 py-3 text-right tabular-nums text-blue-600">
                    {formatMnt(totals.grand.toString())}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Борлуулалтын дэлгэрэнгүй модал — авсан түлш + бараа + төлбөр + буцаалт */}
      {(detail || detailLoading || detailError) && (
        <SaleDetailModal
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => { setDetail(null); setDetailError(null); }}
        />
      )}
    </main>
  );
}

function SaleDetailModal({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: SaleDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const fuelLines = detail?.lines.filter((l) => l.type === 'FUEL') ?? [];
  const productLines = detail?.lines.filter((l) => l.type === 'PRODUCT') ?? [];
  return (
    <Portal>
    <div
      className="animate-overlay fixed inset-0 z-50 grid place-items-end bg-slate-900/50 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl"
      >
        {/* Толгой — тогтмол (скролл хийхэд ч үргэлж харагдана) */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
            <Receipt size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">Борлуулалтын дэлгэрэнгүй</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {detail?.saleNumber ?? (loading ? 'Ачаалж байна…' : '—')}
            </p>
          </div>
          {detail && <StatusBadge status={detail.status as SaleStatus} />}
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Хаах"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        {loading && !detail && (
          <p className="py-8 text-center text-sm text-muted-foreground">Ачаалж байна…</p>
        )}

        {detail && (
          <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-5">
            {/* ── Зүүн: худалдан авсан зүйл ── */}
            <div className="space-y-5 p-5 sm:p-6 md:col-span-3">
              {fuelLines.length > 0 && (
                <DetailTable
                  title="Түлш"
                  icon={Fuel}
                  lines={fuelLines.map((l) => ({
                    // Тоо хэмжээ серверээс цэвэр decimal string (≤3) ирдэг тул JS float ашиглахгүй (§17.4).
                    desc: l.description,
                    qty: `${l.quantity} л`,
                    unitPrice: l.unitPriceMnt,
                    total: l.lineTotalMnt,
                    refundedQty: Number(l.refundedQty) > 0 ? `буцаасан ${l.refundedQty} л` : null,
                  }))}
                />
              )}
              {productLines.length > 0 && (
                <DetailTable
                  title="Бараа"
                  icon={Package}
                  lines={productLines.map((l) => ({
                    desc: l.description,
                    qty: `${l.quantity}${l.unit ? ` ${l.unit}` : ''}`,
                    unitPrice: l.unitPriceMnt,
                    total: l.lineTotalMnt,
                    refundedQty: Number(l.refundedQty) > 0 ? `буцаасан ${l.refundedQty}` : null,
                  }))}
                />
              )}
            </div>

            {/* ── Баруун: хураангуй (мета + дүн + төлбөр) ── */}
            <aside className="space-y-4 border-t border-border bg-secondary/30 p-5 sm:p-6 md:col-span-2 md:border-l md:border-t-0">
              <div className="space-y-2.5">
                <InfoRow label="Огноо/Цаг" value={ubDateTime(detail.soldAt)} />
                <InfoRow label="Салбар" value={detail.stationLabel ?? '—'} />
                <InfoRow label="Кассчин" value={detail.cashierName ?? '—'} />
                <InfoRow label="Харилцагч" value={detail.customerName ?? '—'} />
                {detail.customerTin && <InfoRow label="ТТД" value={detail.customerTin} />}
              </div>

              <div className="space-y-1.5 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Дэд дүн</span>
                  <span className="tabular-nums">{formatMnt(detail.subtotalMnt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">НӨАТ (10%)</span>
                  <span className="tabular-nums">{formatMnt(detail.vatMnt)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
                  <span className="font-semibold">Нийт дүн</span>
                  <span className="text-xl font-bold tabular-nums text-blue-600">{formatMnt(detail.totalMnt)}</span>
                </div>
              </div>

              {detail.payments.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Төлбөр</h3>
                  <ul className="space-y-1.5 text-sm">
                    {detail.payments.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {PAYMENT_METHOD_LABEL[p.method]}
                          {p.maskedPan ? <span className="ml-1 text-xs">{p.maskedPan}</span> : null}
                        </span>
                        <span className="tabular-nums font-medium">{formatMnt(p.amountMnt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.refunds.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Буцаалт</h3>
                  <ul className="space-y-2 text-sm">
                    {detail.refunds.map((r) => (
                      <li key={r.id} className="rounded-lg border border-amber-300/60 bg-amber-50 p-2.5 dark:bg-amber-950/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{ubDateTime(r.createdAt)}</span>
                          <span className="font-semibold tabular-nums text-amber-700">{formatMnt(r.amountMnt)}</span>
                        </div>
                        {r.reason && <div className="mt-0.5 text-xs text-muted-foreground">{r.reason}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

function StatusBadge({ status }: { status: SaleStatus }) {
  const tone =
    status === 'COMPLETED'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : status === 'REFUNDED'
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {SALE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function DetailTable({
  title,
  icon: Icon,
  lines,
}: {
  title: string;
  icon: typeof Fuel;
  lines: { desc: string; qty: string; unitPrice: string; total: string; refundedQty: string | null }[];
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon size={13} /> {title}
      </h3>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Нэр</th>
              <th className="px-3 py-2 text-right font-medium">Тоо</th>
              <th className="px-3 py-2 text-right font-medium">Нэгж үнэ</th>
              <th className="px-3 py-2 text-right font-medium">Дүн</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <div>{l.desc}</div>
                  {l.refundedQty && (
                    <div className="text-[11px] text-amber-700">{l.refundedQty}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMnt(l.unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMnt(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
