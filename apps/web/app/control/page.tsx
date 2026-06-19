'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Gauge, ImageOff, RefreshCw, UserRound, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, SHIFT_STATUS_LABEL, type ShiftStatus } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { controlApi, type Overview, type PendingShift } from '@/lib/control-api';

export default function ControlPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setData(await controlApi.overview());
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else if (e instanceof ApiException && e.error.statusCode === 403) setError('Зөвхөн нягтлан/менежер/админ хандах эрхтэй');
        else setError('Ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router, reload]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      await reload();
      setMsg(ok);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-8">
      <PageHeader icon={Gauge} title="Хяналтын самбар" subtitle="Салбар, ээлж, өнөөдрийн орлого, батлах хүсэлт">
        <button
          onClick={async () => {
            setBusy(true);
            setError(null);
            setMsg(null);
            try {
              await reload();
            } catch (e) {
              // Серверт хүрэх боломжгүй (offline / API унтарсан) → ApiException биш, дэлгэцэнд найдвартай мессеж
              setError(e instanceof ApiException ? e.error.message : 'Сервертэй холбогдож чадсангүй');
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm transition hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Шинэчлэх
        </button>
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {/* Салбар бүрийн төлөв */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.stations.map((s) => (
          <div key={s.station.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 size={18} /></span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.station.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{s.station.code}</div>
              </div>
            </div>
            <div className="mb-2">
              {s.shift ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${s.shift.status === 'OPEN' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
                    {SHIFT_STATUS_LABEL[s.shift.status as ShiftStatus] ?? s.shift.status}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <UserRound size={12} /> {s.shift.cashierName ?? '—'}
                  </span>
                </div>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Идэвхтэй ээлж алга</span>
              )}
            </div>
            <div className="rounded-xl bg-secondary/50 p-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Өнөөдрийн орлого</span>
                <span className="text-lg font-bold text-blue-600">{formatMnt(s.todayGrossMnt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[])
                  .filter((m) => s.byMethod[m] && s.byMethod[m] !== '0')
                  .map((m) => (
                    <span key={m}>{PAYMENT_METHOD_LABEL[m]}: {formatMnt(s.byMethod[m]!)}</span>
                  ))}
                <span className="ml-auto">{s.salesCount} гүйлгээ</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Хүлээгдэж буй хүсэлт */}
      <section>
        <h2 className="mb-3 font-semibold">Хүлээгдэж буй хүсэлт {data && data.pending.length > 0 ? `(${data.pending.length})` : ''}</h2>
        {!data || data.pending.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 size={26} className="mb-2 opacity-40" /> Хүлээгдэж буй хүсэлт алга
          </div>
        ) : (
          <div className="space-y-3">
            {data.pending.map((p) => (
              <PendingCard key={p.id} p={p} busy={busy} act={act} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PendingCard({ p, busy, act }: { p: PendingShift; busy: boolean; act: (fn: () => Promise<unknown>, ok: string) => void }) {
  const isOpen = p.status === 'PENDING_OPEN';
  const phase = isOpen ? 'OPEN' : 'CLOSE';
  const readings = p.tankReadings.filter((r) => r.phase === phase);
  const cashier = p.cashiers[0]?.employee;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className={`mr-2 rounded-full px-2.5 py-1 text-xs font-medium ${isOpen ? 'bg-sky-500/15 text-sky-700' : 'bg-amber-500/15 text-amber-700'}`}>
            {isOpen ? 'Нээх хүсэлт' : 'Хаах хүсэлт'}
          </span>
          <span className="font-medium">{p.stationLabel}</span>
          {cashier && <span className="ml-2 text-sm text-muted-foreground">· {cashier.firstName} {cashier.lastName}</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => act(() => (isOpen ? controlApi.approveOpen(p.id) : controlApi.approveClose(p.id)), 'Хүсэлт батлагдлаа')}
            disabled={busy}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"
          >
            <CheckCircle2 size={15} /> Батлах
          </button>
          <button
            onClick={() => {
              const reason = window.prompt('Татгалзах шалтгаан (заавал биш):');
              if (reason === null) return; // болих
              void act(() => controlApi.reject(p.id, reason), 'Хүсэлт татгалзлаа');
            }}
            disabled={busy}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium text-destructive shadow-sm transition hover:bg-destructive/10 disabled:opacity-50"
          >
            <XCircle size={15} /> Татгалзах
          </button>
        </div>
      </div>

      {/* Хаалт: бэлэн + хэлбэрээр тушаалт vs тооцоо */}
      {!isOpen && (
        <div className="mb-3 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Хэлбэр</th>
                <th className="px-3 py-2 text-right font-medium">Тушаасан</th>
                <th className="px-3 py-2 text-right font-medium">Тооцоо</th>
                <th className="px-3 py-2 text-right font-medium">Зөрүү</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(() => {
                const cashVar = BigInt(p.closingCashMnt ?? '0') - BigInt(p.expectedCashMnt ?? '0');
                return (
                  <tr>
                    <td className="px-3 py-2 font-medium">Бэлэн (тоолсон)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMnt(p.closingCashMnt ?? '0')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMnt(p.expectedCashMnt ?? '0')}</td>
                    <td className={`px-3 py-2 text-right font-medium tabular-nums ${cashVar === 0n ? 'text-emerald-700' : 'text-destructive'}`}>{formatMnt(cashVar.toString())}</td>
                  </tr>
                );
              })()}
              {p.tenders.map((t) => {
                const v = BigInt(t.declaredMnt) - BigInt(t.expectedMnt);
                return (
                  <tr key={t.method}>
                    <td className="px-3 py-2">{PAYMENT_METHOD_LABEL[t.method as PaymentMethod] ?? t.method}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMnt(t.declaredMnt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMnt(t.expectedMnt)}</td>
                    <td className={`px-3 py-2 text-right font-medium tabular-nums ${v === 0n ? 'text-emerald-700' : 'text-destructive'}`}>{formatMnt(v.toString())}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Савны түлшний хэмжээ (см + зураг) */}
      {readings.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Савны түлшний хэмжээ</p>
          <div className="flex flex-wrap gap-2">
            {readings.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl border bg-background p-1.5">
                <Thumb src={r.imageUrl} />
                <div className="text-sm">
                  <div className="font-mono text-xs">{r.fuelTank.code}</div>
                  <div className="font-medium">{r.centimeters} см{r.liters ? ` · ${Number(r.liters).toLocaleString()} л` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <ImageOff size={16} />
      )}
    </div>
  );
}
