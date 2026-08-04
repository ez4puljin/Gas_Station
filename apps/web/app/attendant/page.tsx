'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Fuel, LogOut, ShoppingCart } from 'lucide-react';
import { formatMnt } from '@fuel/schemas';
import { ApiException, apiFetch, tokenStore } from '@/lib/api';
import { type CloseRequirements, controlApi, type ShiftFull } from '@/lib/control-api';
import { posApi, type StationDto } from '@/lib/pos-api';

interface Me {
  name: string | null;
  stations?: { id: string; code: string; name: string }[];
}

const digits = (s: string) => s.replace(/[^\d]/g, '');

/**
 * Түгээгчийн гар утасны дэлгэц — нэг баганат, том товчтой.
 * Урсгал: Салбар сонгох → ажиллах хүсэлт → (батлагдахыг хүлээх) → борлуулалт → заавал тулгалттай хаалт.
 * Нэг салбарт нэг л түгээгч ажиллана (серверээс хатуу шалгагдана).
 */
export default function AttendantPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [shift, setShift] = useState<ShiftFull | null>(null);
  const [req, setReq] = useState<CloseRequirements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // нээх маягт
  const [openCash, setOpenCash] = useState('');
  // хаах маягт
  const [closing, setClosing] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [tenders, setTenders] = useState<Record<string, string>>({});
  const [tankCm, setTankCm] = useState<Record<string, string>>({});

  const myEmployeeId = shift?.cashiers?.[0]?.employee?.id ?? null;

  const load = useCallback(async (sid: string) => {
    if (!sid) { setShift(null); return; }
    const sh = await controlApi.current(sid);
    setShift(sh);
    // Хаалтад заавал бөглөх зүйлсийг СЕРВЭРЭЭС авна (UI таамаглахгүй).
    if (sh && (sh.status === 'OPEN' || sh.status === 'PENDING_CLOSE')) {
      setReq(await controlApi.closeRequirements(sh.id).catch(() => null));
    } else setReq(null);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    Promise.all([apiFetch<Me>('/auth/me'), posApi.stations()])
      .then(([m, st]) => {
        setMe(m);
        setStations(st);
        // Түгээгч зөвхөн өөрт хуваарилагдсан салбарт ажиллана
        const mine = m.stations?.[0]?.id ?? st[0]?.id ?? '';
        setStationId(mine);
      })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => { if (ready && stationId) void load(stationId).catch(() => setError('Ачаалахад алдаа')); }, [ready, stationId, load]);

  // Хүлээгдэж буй төлөвт автоматаар шинэчилнэ (батлагдмагц шууд орно)
  useEffect(() => {
    if (!shift || (shift.status !== 'PENDING_OPEN' && shift.status !== 'PENDING_CLOSE')) return;
    const t = setInterval(() => { void load(stationId).catch(() => undefined); }, 10_000);
    return () => clearInterval(t);
  }, [shift, stationId, load]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await load(stationId); setMsg(okMsg); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа'); }
    finally { setBusy(false); }
  }

  function submitClose() {
    const tenderList = (req?.methods ?? []).map((m) => ({ method: m.method, declaredMnt: digits(tenders[m.method] ?? '') || '0' }));
    const tankReadings = (req?.tanks ?? []).map((t) => ({ tankId: t.id, centimeters: Number(tankCm[t.id] ?? 0) }));
    void act(
      () => controlApi.requestClose(shift!.id, { countedCashMnt: digits(countedCash) || '0', tenders: tenderList, tankReadings }),
      'Хаалтын хүсэлт илгээгдлээ — батлагдахыг хүлээнэ үү',
    ).then(() => setClosing(false));
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  const st = stations.find((s) => s.id === stationId);
  const closeReady =
    countedCash !== '' &&
    (req?.methods ?? []).every((m) => (tenders[m.method] ?? '') !== '') &&
    (req?.tanks ?? []).every((t) => (tankCm[t.id] ?? '') !== '');

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25"><Fuel size={20} /></div>
          <div>
            <div className="text-base font-bold leading-tight">Түгээгч</div>
            <div className="text-xs text-muted-foreground">{me?.name ?? '—'}</div>
          </div>
        </div>
        <button onClick={() => { tokenStore.clear(); router.replace('/login'); }} className="inline-flex min-h-touch items-center gap-1 rounded-xl border px-3 text-sm"><LogOut size={15} /> Гарах</button>
      </header>

      {error && <p className="mb-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">Салбар</span>
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          disabled={!!shift}
          className="min-h-touch w-full rounded-2xl border bg-background px-3 text-base disabled:opacity-60"
        >
          {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
        {shift && <span className="mt-1 block text-xs text-muted-foreground">Ээлж нээлттэй үед салбар солих боломжгүй</span>}
      </label>

      {/* ── Ээлжгүй: ажиллах хүсэлт ── */}
      {!shift && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-1 text-base font-semibold">Ажиллах хүсэлт</h2>
          <p className="mb-4 text-sm text-muted-foreground">Хүсэлтийг эрх бүхий ажилтан баталсны дараа борлуулалт эхэлнэ.</p>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Эхлэх бэлэн мөнгө (₮)</span>
            <input value={openCash} onChange={(e) => setOpenCash(digits(e.target.value))} inputMode="numeric" placeholder="0" className="min-h-touch w-full rounded-2xl border bg-background px-3 text-lg tabular-nums" />
          </label>
          <button
            onClick={() => act(() => controlApi.requestOpen({ stationId, openingCashMnt: openCash || '0' }), 'Хүсэлт илгээгдлээ')}
            disabled={busy || !stationId}
            className="min-h-touch w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"
          >
            Ажиллах хүсэлт илгээх
          </button>
        </section>
      )}

      {/* ── Хүлээгдэж буй ── */}
      {shift && (shift.status === 'PENDING_OPEN' || shift.status === 'PENDING_CLOSE') && (
        <section className="rounded-2xl border bg-amber-500/10 p-5 text-center shadow-sm">
          <Clock size={32} className="mx-auto mb-2 text-amber-600" />
          <h2 className="text-base font-semibold text-amber-800">
            {shift.status === 'PENDING_OPEN' ? 'Ажиллах хүсэлт хүлээгдэж байна' : 'Хаалт хүлээгдэж байна'}
          </h2>
          <p className="mt-1 text-sm text-amber-700">Эрх бүхий ажилтан баталмагц энэ дэлгэц өөрөө шинэчлэгдэнэ.</p>
          <p className="mt-3 text-xs text-muted-foreground">{st?.code} · {new Date(shift.openedAt).toLocaleString('mn-MN')}</p>
        </section>
      )}

      {/* ── Идэвхтэй ээлж ── */}
      {shift?.status === 'OPEN' && !closing && (
        <section className="space-y-3">
          <div className="rounded-2xl border bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-lg">
            <div className="text-sm opacity-90">Ээлж идэвхтэй</div>
            <div className="mt-0.5 text-xs opacity-80">{st?.code} · {new Date(shift.openedAt).toLocaleString('mn-MN')}-аас</div>
            <div className="mt-3 text-sm opacity-90">Эхлэх бэлэн</div>
            <div className="text-2xl font-bold tabular-nums">{formatMnt(shift.openingCashMnt)}</div>
          </div>
          <button onClick={() => router.push('/pos')} className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-sm">
            <ShoppingCart size={20} /> Борлуулалт хийх
          </button>
          <button onClick={() => setClosing(true)} className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl border py-4 text-base font-semibold">
            <ClipboardCheck size={20} /> Ээлж хаах (тооллого)
          </button>
        </section>
      )}

      {/* ── Хаалт: ЗААВАЛ тулгалт ── */}
      {shift?.status === 'OPEN' && closing && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-1 text-base font-semibold">Ээлжийн тооллого</h2>
          <p className="mb-4 text-sm text-muted-foreground">Доорх бүх талбарыг бөглөнө — тулгалтгүйгээр ээлж хаагдахгүй.</p>

          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Тоолсон бэлэн мөнгө (₮)</span>
            <input value={countedCash} onChange={(e) => setCountedCash(digits(e.target.value))} inputMode="numeric" placeholder="0" className="min-h-touch w-full rounded-2xl border bg-background px-3 text-lg tabular-nums" />
          </label>

          {(req?.methods.length ?? 0) > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Тушаалт (заавал)</div>
              <div className="space-y-2">
                {req!.methods.map((m) => (
                  <label key={m.method} className="block text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground">{m.label}</span>
                    <input value={tenders[m.method] ?? ''} onChange={(e) => setTenders((t) => ({ ...t, [m.method]: digits(e.target.value) }))} inputMode="numeric" placeholder="0" className="min-h-touch w-full rounded-2xl border bg-background px-3 text-base tabular-nums" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {(req?.tanks.length ?? 0) > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Савны хаалтын хэмжээ, см (заавал)</div>
              <div className="space-y-2">
                {req!.tanks.map((t) => (
                  <label key={t.id} className="block text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground">{t.code}</span>
                    <input value={tankCm[t.id] ?? ''} onChange={(e) => setTankCm((s) => ({ ...s, [t.id]: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="0.0" className="min-h-touch w-full rounded-2xl border bg-background px-3 text-base tabular-nums" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {!closeReady && <p className="mb-3 text-xs text-amber-700">Бүх талбарыг бөглөнө үү.</p>}
          <div className="flex gap-2">
            <button onClick={() => setClosing(false)} className="min-h-touch flex-1 rounded-2xl border text-base">Болих</button>
            <button onClick={submitClose} disabled={busy || !closeReady} className="min-h-touch flex-[2] rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50">Хаалт илгээх</button>
          </div>
        </section>
      )}

      {/* Ээлж өөр түгээгчийнх бол — сануулга */}
      {shift && myEmployeeId && me && shift.status === 'OPEN' && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Ээлжийн түгээгч: {shift.cashiers.map((c) => `${c.employee.lastName} ${c.employee.firstName}`.trim()).join(', ')}
        </p>
      )}
    </main>
  );
}
