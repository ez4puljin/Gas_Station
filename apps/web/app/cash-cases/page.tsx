'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, HandCoins, ScrollText, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import {
  CASH_CASE_RESOLUTION_LABEL,
  CASH_CASE_STATUS_LABEL,
  type CashCaseResolution,
  type CashCaseStatus,
  formatMnt,
  SHORTAGE_RESOLUTIONS,
} from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { type CashCaseList, type CashCaseRow, type Scorecard, cashCasesApi } from '@/lib/cash-cases-api';

const STATUS_CLS: Record<CashCaseStatus, string> = {
  OPEN: 'bg-destructive/10 text-destructive',
  PENDING_DEDUCTION: 'bg-amber-500/15 text-amber-700',
  RESOLVED: 'bg-emerald-500/15 text-emerald-700',
};

function ubToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function ubMonthStart() {
  return `${new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7)}-01`;
}

export default function CashCasesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'cases' | 'scorecard'>('cases');
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | CashCaseStatus>('');
  const [from, setFrom] = useState(ubMonthStart());
  const [to, setTo] = useState(ubToday());
  const [data, setData] = useState<CashCaseList | null>(null);
  const [score, setScore] = useState<Scorecard | null>(null);
  const [target, setTarget] = useState<CashCaseRow | null>(null);
  const [resolution, setResolution] = useState<CashCaseResolution>('DEDUCT_SALARY');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (sid: string, st: '' | CashCaseStatus, f: string, t: string) => {
    const [list, sc] = await Promise.all([
      cashCasesApi.list({ stationId: sid || undefined, status: st || undefined, from: f, to: t }),
      cashCasesApi.scorecard({ from: f, to: t, stationId: sid || undefined }),
    ]);
    setData(list);
    setScore(sc);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    posApi.stations()
      .then(setStations)
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => { if (ready) void reload(stationId, statusFilter, from, to).catch(() => setError('Ачаалахад алдаа')); }, [ready, stationId, statusFilter, from, to, reload]);

  async function submitResolve() {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      await cashCasesApi.resolve(target.id, resolution, note || undefined);
      await reload(stationId, statusFilter, from, to);
      setMsg('Хэрэг шийдвэрлэгдлээ');
      setTarget(null); setNote('');
    } catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={ShieldAlert} title="Кассын хариуцлага" subtitle="Ээлжийн бэлэн мөнгөний зөрүү — кассчинд хариуцуулж шийдвэрлэх (нөхөх / цалингаас суутгах / акт)" />

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
          {([['cases', 'Хэргүүд'], ['scorecard', 'Кассчны үнэлгээ']] as ['cases' | 'scorecard', string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{l}</button>
          ))}
        </div>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Салбар</span>
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
            <option value="">Бүх салбар</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Эхлэх</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Дуусах</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<AlertTriangle size={15} className="text-destructive" />} label="Шийдвэрлээгүй" value={String(data?.openCount ?? 0)} />
        <Stat icon={<HandCoins size={15} className="text-amber-600" />} label="Нөхөгдөх үлдэгдэл" value={data ? formatMnt(data.outstandingMnt) : '…'} cls="text-amber-600" />
        <Stat icon={<TrendingDown size={15} className="text-destructive" />} label="Дутагдал (мужид)" value={score ? formatMnt(score.totals.shortageMnt) : '…'} cls="text-destructive" />
        <Stat icon={<TrendingUp size={15} className="text-emerald-600" />} label="Илүүдэл (мужид)" value={score ? formatMnt(score.totals.overageMnt) : '…'} cls="text-emerald-600" />
      </div>

      {tab === 'cases' && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ScrollText size={16} className="text-muted-foreground" /> Зөрүүний хэргүүд</h2>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | CashCaseStatus)} className="rounded-lg border bg-background px-2 py-1 text-xs">
              <option value="">Бүх төлөв</option>
              {(Object.keys(CASH_CASE_STATUS_LABEL) as CashCaseStatus[]).map((s) => <option key={s} value={s}>{CASH_CASE_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Огноо</th><th className="py-2 font-medium">Салбар</th><th className="py-2 font-medium">Кассчин</th><th className="py-2 text-right font-medium">Зөрүү</th><th className="py-2 text-right font-medium">Үлдэгдэл</th><th className="py-2 font-medium">Төлөв</th><th className="py-2 font-medium">Шийдэл</th><th className="py-2" /></tr></thead>
              <tbody>
                {data?.rows.map((r) => {
                  const shortage = BigInt(r.varianceMnt) < 0n;
                  const left = BigInt(r.amountMnt) - BigInt(r.recoveredMnt);
                  return (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}</td>
                      <td className="py-2 text-muted-foreground">{r.station.code}</td>
                      <td className="py-2">{r.employee.lastName} {r.employee.firstName}</td>
                      <td className={`py-2 text-right font-medium tabular-nums ${shortage ? 'text-destructive' : 'text-emerald-600'}`}>{shortage ? '−' : '+'}{formatMnt(r.amountMnt, { symbol: false })}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{left > 0n ? formatMnt(left.toString(), { symbol: false }) : '—'}</td>
                      <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[r.status]}`}>{CASH_CASE_STATUS_LABEL[r.status]}</span></td>
                      <td className="py-2 text-xs text-muted-foreground">{r.resolution ? CASH_CASE_RESOLUTION_LABEL[r.resolution] : '—'}{r.note && <div className="italic">{r.note}</div>}</td>
                      <td className="py-2 text-right">
                        {r.status !== 'RESOLVED' && (
                          <button onClick={() => { setTarget(r); setResolution('DEDUCT_SALARY'); setNote(''); }} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent">Шийдвэрлэх</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(!data || data.rows.length === 0) && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Энэ мужид зөрүүний хэрэг алга — кассын тооцоо цэвэр</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'scorecard' && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Кассчин тус бүрийн зөрүүний үнэлгээ</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Кассчин</th><th className="py-2 text-right font-medium">Хэрэг</th><th className="py-2 text-right font-medium">Дутагдал</th><th className="py-2 text-right font-medium">Илүүдэл</th><th className="py-2 text-right font-medium">Цэвэр зөрүү</th><th className="py-2 text-right font-medium">Нөхөгдөөгүй</th></tr></thead>
              <tbody>
                {score?.rows.map((r) => (
                  <tr key={r.employeeId} className="border-b">
                    <td className="py-2">{r.name}{r.employeeCode && <span className="ml-1 text-xs text-muted-foreground">{r.employeeCode}</span>}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{r.cases} <span className="text-xs">({r.shortageCount}↓/{r.overageCount}↑)</span></td>
                    <td className="py-2 text-right tabular-nums text-destructive">{formatMnt(r.shortageMnt, { symbol: false })}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-600">{formatMnt(r.overageMnt, { symbol: false })}</td>
                    <td className={`py-2 text-right font-medium tabular-nums ${BigInt(r.netVarianceMnt) < 0n ? 'text-destructive' : 'text-emerald-600'}`}>{formatMnt(r.netVarianceMnt, { symbol: false })}</td>
                    <td className="py-2 text-right tabular-nums text-amber-600">{BigInt(r.outstandingMnt) > 0n ? formatMnt(r.outstandingMnt, { symbol: false }) : '—'}</td>
                  </tr>
                ))}
                {(!score || score.rows.length === 0) && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Энэ мужид зөрүү бүртгэгдээгүй</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {target && (
        <Portal>
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
              <h3 className="mb-1 text-base font-semibold">Зөрүүг шийдвэрлэх</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {target.employee.lastName} {target.employee.firstName} · {target.station.code} ·{' '}
                <span className="font-medium text-destructive">{formatMnt(BigInt(target.amountMnt) - BigInt(target.recoveredMnt))}</span> дутагдал
              </p>
              <div className="mb-3 space-y-2">
                {SHORTAGE_RESOLUTIONS.map((r) => (
                  <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-sm transition ${resolution === r ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                    <input type="radio" name="res" checked={resolution === r} onChange={() => setResolution(r)} className="accent-primary" />
                    {CASH_CASE_RESOLUTION_LABEL[r]}
                  </label>
                ))}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={resolution === 'WRITE_OFF' ? 'Актын шалтгаан (заавал)' : 'Тэмдэглэл (заавал биш)'} className="mb-4 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setTarget(null)} className="rounded-xl border px-4 py-2 text-sm hover:bg-accent">Болих</button>
                <button onClick={submitResolve} disabled={busy || (resolution === 'WRITE_OFF' && note.trim().length < 3)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Батлах</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </main>
  );
}

function Stat({ icon, label, value, cls }: { icon: React.ReactNode; label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cls ?? ''}`}>{value}</div>
    </div>
  );
}
