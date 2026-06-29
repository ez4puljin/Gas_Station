'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, LogIn, LogOut, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMinutesHm } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { type AttEmployee, type AttList, type AttRecord, type AttSummary, attendanceApi } from '@/lib/attendance-api';

function ubToday() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return ub.toISOString().slice(0, 10);
}
function ubMonthStart() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return `${ub.toISOString().slice(0, 7)}-01`;
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ulaanbaatar' });
}
function dmy(iso: string) {
  return new Date(iso).toLocaleDateString('mn-MN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Ulaanbaatar' });
}

export default function AttendancePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [employees, setEmployees] = useState<AttEmployee[]>([]);
  const [open, setOpen] = useState<AttRecord[]>([]);
  const [summary, setSummary] = useState<AttSummary | null>(null);
  const [log, setLog] = useState<AttList | null>(null);
  const [from, setFrom] = useState(ubMonthStart());
  const [to, setTo] = useState(ubToday());
  const [pickEmp, setPickEmp] = useState('');
  const [breakById, setBreakById] = useState<Record<string, string>>({});
  const [showLog, setShowLog] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const reload = useCallback(async (sid: string, f: string, t: string, withLog: boolean) => {
    const [cur, sum, lg] = await Promise.all([
      attendanceApi.current(sid || undefined),
      attendanceApi.summary({ from: f, to: t, stationId: sid || undefined }),
      withLog ? attendanceApi.list({ from: f, to: t, stationId: sid || undefined }) : Promise.resolve(null),
    ]);
    setOpen(cur);
    setSummary(sum);
    if (lg) setLog(lg);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    Promise.all([posApi.stations(), attendanceApi.employees()])
      .then(([s, emps]) => { setStations(s); setEmployees(emps); if (s[0]) setStationId(s[0].id); })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => {
    if (ready) void reload(stationId, from, to, showLog).catch(() => undefined);
  }, [ready, stationId, from, to, showLog, reload]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await reload(stationId, from, to, showLog); setMsg(okMsg); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  // Аль хэдийн ажиллаж буй ажилтнуудыг сонголтоос хасах
  const openEmpIds = new Set(open.map((o) => o.employeeId));
  const available = employees.filter((e) => !openEmpIds.has(e.id));

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={Clock} title="Цаг бүртгэл" subtitle="Ажилтны ирц — орох/гарах цаг, ажилласан хугацааны нэгтгэл" />

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <div className="mb-5 flex flex-wrap items-end gap-3">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Цаг бүртгэх */}
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><LogIn size={16} className="text-emerald-600" /> Орох цаг бүртгэх</h2>
          <select value={pickEmp} onChange={(e) => setPickEmp(e.target.value)} className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm">
            <option value="">— Ажилтан сонгох —</option>
            {available.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}{e.employeeCode ? ` (${e.employeeCode})` : ''}</option>)}
          </select>
          <button
            onClick={() => act(() => attendanceApi.clockIn({ employeeId: pickEmp, stationId }), 'Орох цаг бүртгэгдлээ').then(() => setPickEmp(''))}
            disabled={busy || !pickEmp || !stationId}
            className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
            Орлоо
          </button>
          {!stationId && <p className="mt-2 text-xs text-muted-foreground">Орох цаг бүртгэхийн тулд салбар сонгоно уу.</p>}
        </section>

        {/* Одоо ажиллаж буй */}
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-blue-600" /> Одоо ажиллаж буй <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700">{open.length}</span></h2>
          <div className="space-y-2">
            {open.map((r) => {
              const elapsed = Math.max(0, Math.round((now - new Date(r.clockIn).getTime()) / 60_000));
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/50 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.employee.lastName} {r.employee.firstName}</div>
                    <div className="text-xs text-muted-foreground">{r.station ? `${r.station.code} · ` : ''}{hhmm(r.clockIn)}-аас · {formatMinutesHm(elapsed)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={breakById[r.id] ?? ''} onChange={(e) => setBreakById((b) => ({ ...b, [r.id]: e.target.value.replace(/[^\d]/g, '') }))}
                      inputMode="numeric" placeholder="завс. мин" title="Завсарлага (минут)"
                      className="w-20 rounded-lg border bg-background px-2 py-1 text-right text-sm" />
                    <button
                      onClick={() => act(() => attendanceApi.clockOut(r.id, { breakMinutes: breakById[r.id] ? Number(breakById[r.id]) : undefined }), 'Гарах цаг бүртгэгдлээ')}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                      <LogOut size={13} /> Гаргах
                    </button>
                  </div>
                </div>
              );
            })}
            {open.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Одоогоор ажиллаж буй ажилтан алга</p>}
          </div>
        </section>
      </div>

      {/* Нэгтгэл */}
      <section className="mt-6 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock size={16} className="text-muted-foreground" /> Ажилласан хугацааны нэгтгэл</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Нийт: <span className="font-semibold text-foreground">{summary ? formatMinutesHm(summary.totalMinutes) : '…'}</span></span>
            <button onClick={() => setShowLog((v) => !v)} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent">{showLog ? 'Лог нуух' : 'Дэлгэрэнгүй лог'}</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Ажилтан</th><th className="py-2 text-right font-medium">Ээлж</th><th className="py-2 text-right font-medium">Ажилласан</th></tr></thead>
          <tbody>
            {summary?.rows.map((r) => (
              <tr key={r.employeeId} className="border-b">
                <td className="py-2">{r.name}{r.employeeCode && <span className="ml-1 text-xs text-muted-foreground">{r.employeeCode}</span>}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.shifts}</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatMinutesHm(r.workedMinutes)}</td>
              </tr>
            ))}
            {(!summary || summary.rows.length === 0) && <tr><td colSpan={3} className="py-8 text-center text-muted-foreground">Энэ мужид хаагдсан бичлэг алга</td></tr>}
          </tbody>
        </table>
      </section>

      {showLog && (
        <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Бичлэгийн лог</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Огноо</th><th className="py-2 font-medium">Ажилтан</th><th className="py-2 font-medium">Салбар</th><th className="py-2 font-medium">Орсон</th><th className="py-2 font-medium">Гарсан</th><th className="py-2 text-right font-medium">Завс.</th><th className="py-2 text-right font-medium">Ажилласан</th><th className="py-2" /></tr></thead>
            <tbody>
              {log?.rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-1.5 text-muted-foreground">{dmy(r.clockIn)}</td>
                  <td className="py-1.5">{r.employee.lastName} {r.employee.firstName}</td>
                  <td className="py-1.5 text-muted-foreground">{r.station?.code ?? '—'}</td>
                  <td className="py-1.5 tabular-nums">{hhmm(r.clockIn)}</td>
                  <td className="py-1.5 tabular-nums">{r.clockOut ? hhmm(r.clockOut) : <span className="text-emerald-600">ажиллаж буй</span>}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.breakMinutes || '—'}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{r.workedMinutes != null ? formatMinutesHm(r.workedMinutes) : '—'}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => { const reason = window.prompt('Устгах шалтгаан?'); if (reason) void act(() => attendanceApi.remove(r.id, reason), 'Бичлэг устгагдлаа'); }} disabled={busy} title="Устгах" className="text-muted-foreground hover:text-destructive disabled:opacity-50"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {(!log || log.rows.length === 0) && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Бичлэг алга</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
