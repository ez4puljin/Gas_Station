'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, CheckCircle2, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import {
  LEAVE_STATUS_LABEL,
  LEAVE_TYPE_LABEL,
  LEAVE_TYPES,
  type LeaveStatus,
  type LeaveType,
} from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { type LeaveBalanceRow, type LeaveEmployee, type LeaveRow, leaveApi } from '@/lib/leave-api';

const STATUS_CLS: Record<LeaveStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700',
  APPROVED: 'bg-emerald-500/15 text-emerald-700',
  REJECTED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
};

function ubToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function LeavePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'requests' | 'balances'>('requests');
  const [employees, setEmployees] = useState<LeaveEmployee[]>([]);
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | LeaveStatus>('');
  const [year, setYear] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // шинэ хүсэлт
  const [fEmp, setFEmp] = useState('');
  const [fType, setFType] = useState<LeaveType>('ANNUAL');
  const [fStart, setFStart] = useState(ubToday());
  const [fEnd, setFEnd] = useState(ubToday());
  const [fReason, setFReason] = useState('');

  const reload = useCallback(async (st: '' | LeaveStatus, yr: number) => {
    const [lst, bal] = await Promise.all([
      leaveApi.list({ status: st || undefined }),
      leaveApi.balances(yr),
    ]);
    setRows(lst.rows);
    setBalances(bal.rows);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    leaveApi.employees()
      .then(setEmployees)
      .then(() => reload('', year))
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router, reload, year]);

  useEffect(() => { if (ready) void reload(statusFilter, year).catch(() => undefined); }, [ready, statusFilter, year, reload]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await reload(statusFilter, year); setMsg(okMsg); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={CalendarDays} title="Чөлөө" subtitle="Ээлжийн амралт / өвчний / цалингүй чөлөө — хүсэлт→батлах + жилийн үлдэгдэл" />

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <div className="mb-4 flex gap-1 rounded-xl border bg-card p-1 shadow-sm w-fit">
        {([['requests', 'Хүсэлтүүд'], ['balances', 'Үлдэгдэл']] as ['requests' | 'balances', string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{l}</button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          {/* Шинэ хүсэлт */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus size={16} className="text-primary" /> Чөлөөний хүсэлт</h2>
            <label className="mb-2 block text-xs text-muted-foreground">Ажилтан
              <select value={fEmp} onChange={(e) => setFEmp(e.target.value)} className="mt-1 min-h-touch w-full rounded-xl border bg-background px-3 text-sm text-foreground">
                <option value="">— сонгох —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}{e.employeeCode ? ` (${e.employeeCode})` : ''}</option>)}
              </select></label>
            <label className="mb-2 block text-xs text-muted-foreground">Төрөл
              <select value={fType} onChange={(e) => setFType(e.target.value as LeaveType)} className="mt-1 min-h-touch w-full rounded-xl border bg-background px-3 text-sm text-foreground">
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
              </select></label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-foreground">Эхлэх
                <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} className="mt-1 min-h-touch w-full rounded-xl border bg-background px-2 text-sm text-foreground" /></label>
              <label className="block text-xs text-muted-foreground">Дуусах
                <input type="date" value={fEnd} min={fStart} onChange={(e) => setFEnd(e.target.value)} className="mt-1 min-h-touch w-full rounded-xl border bg-background px-2 text-sm text-foreground" /></label>
            </div>
            <input value={fReason} onChange={(e) => setFReason(e.target.value)} placeholder="Шалтгаан (заавал биш)" className="mb-3 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
            <button
              onClick={() => act(() => leaveApi.request({ employeeId: fEmp, type: fType, startDate: fStart, endDate: fEnd, reason: fReason || undefined }), 'Хүсэлт илгээгдлээ').then(() => { setFEmp(''); setFReason(''); })}
              disabled={busy || !fEmp || fEnd < fStart}
              className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
              Хүсэлт илгээх
            </button>
          </section>

          {/* Жагсаалт */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Хүсэлтүүд</h2>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | LeaveStatus)} className="rounded-lg border bg-background px-2 py-1 text-xs">
                <option value="">Бүх төлөв</option>
                {(Object.keys(LEAVE_STATUS_LABEL) as LeaveStatus[]).map((s) => <option key={s} value={s}>{LEAVE_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Ажилтан</th><th className="py-2 font-medium">Төрөл</th><th className="py-2 font-medium">Хугацаа</th><th className="py-2 text-right font-medium">Хоног</th><th className="py-2 font-medium">Төлөв</th><th className="py-2" /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="py-2">{r.employee.lastName} {r.employee.firstName}{r.reason && <div className="text-xs text-muted-foreground">{r.reason}</div>}</td>
                    <td className="py-2">{LEAVE_TYPE_LABEL[r.type]}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">{r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}</td>
                    <td className="py-2 text-right tabular-nums">{r.days}</td>
                    <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[r.status]}`}>{LEAVE_STATUS_LABEL[r.status]}</span></td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        {r.status === 'PENDING' && (
                          <>
                            <button onClick={() => act(() => leaveApi.approve(r.id), 'Зөвшөөрлөө')} disabled={busy} title="Зөвшөөрөх" className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-700 hover:bg-emerald-500/25 disabled:opacity-50"><Check size={14} /></button>
                            <button onClick={() => { const note = window.prompt('Татгалзах шалтгаан (заавал биш)?') ?? undefined; void act(() => leaveApi.reject(r.id, note), 'Татгалзлаа'); }} disabled={busy} title="Татгалзах" className="rounded-lg bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-50"><X size={14} /></button>
                          </>
                        )}
                        {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                          <button onClick={() => { if (window.confirm('Энэ чөлөөг цуцлах уу?')) void act(() => leaveApi.cancel(r.id), 'Цуцаллаа'); }} disabled={busy} title="Цуцлах" className="rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50">Цуцлах</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Хүсэлт алга</td></tr>}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === 'balances' && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ээлжийн амралтын үлдэгдэл</h2>
            <label className="text-sm"><span className="mr-2 text-xs text-muted-foreground">Жил</span>
              <input type="number" value={year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-lg border bg-background px-2 py-1 text-sm" /></label>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Ажилтан</th><th className="py-2 text-right font-medium">Эрх (өдөр)</th><th className="py-2 text-right font-medium">Авсан</th><th className="py-2 text-right font-medium">Үлдэгдэл</th></tr></thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.employeeId} className="border-b">
                  <td className="py-2">{b.name}{b.employeeCode && <span className="ml-1 text-xs text-muted-foreground">{b.employeeCode}</span>}</td>
                  <td className="py-2 text-right tabular-nums">{b.entitlement}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{b.used}</td>
                  <td className={`py-2 text-right font-medium tabular-nums ${b.remaining < 0 ? 'text-destructive' : b.remaining <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>{b.remaining}</td>
                </tr>
              ))}
              {balances.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Ажилтан алга</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
