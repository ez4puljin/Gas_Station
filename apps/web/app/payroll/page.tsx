'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, CheckCircle2, Lock, Pencil, RotateCcw, Users, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { type PayrollEmployee, type PayrollPreview, type PayrollRun, payrollApi } from '@/lib/payroll-api';

function thisMonth() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return `${ub.getUTCFullYear()}-${String(ub.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'run' | 'staff'>('run');
  const [period, setPeriod] = useState(thisMonth());
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const reload = useCallback(async (p: string) => {
    const [pv, emps, rs] = await Promise.all([
      payrollApi.preview(p).catch(() => null),
      payrollApi.employees(),
      payrollApi.list().catch(() => []),
    ]);
    setPreview(pv);
    setEmployees(emps);
    setRuns(rs);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    reload(period)
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router, reload, period]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setError(null);
    try { await fn(); await reload(period); setMsg(okMsg); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;
  const t = preview?.totals;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={Wallet} title="Цалин" subtitle="Сарын цалин тооцоолол — НДШ/ХХОАТ суутгал + Ерөнхий дэвтэрт бичих" />

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <div className="mb-4 flex gap-1 rounded-xl border bg-card p-1 shadow-sm w-fit">
        {([['run', 'Цалин тооцоо'], ['staff', 'Ажилтны цалин']] as ['run' | 'staff', string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{l}</button>
        ))}
      </div>

      {tab === 'run' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Сар</span>
                <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
              {preview?.posted ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-700"><Lock size={14} /> Тооцоологдсон</span>
              ) : (
                <button onClick={() => act(() => payrollApi.run(period), 'Цалин тооцоолж GL-д бичигдлээ')} disabled={busy || !preview?.items.length} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"><Banknote size={16} /> Цалин тооцоолох</button>
              )}
            </div>
            {t && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Нийт цалин (gross)" value={formatMnt(t.grossMnt)} />
                <Stat label="НДШ (ажилтан)" value={formatMnt(t.employeeNdshMnt)} cls="text-amber-600" />
                <Stat label="ХХОАТ" value={formatMnt(t.pitMnt)} cls="text-amber-600" />
                <Stat label="НДШ (ажил олгогч)" value={formatMnt(t.employerNdshMnt)} />
                {BigInt(t.deductionMnt) > 0n && <Stat label="Кассын суутгал" value={formatMnt(t.deductionMnt)} cls="text-destructive" />}
                <Stat label="Гарт олгох (net)" value={formatMnt(t.netMnt)} cls="text-emerald-600" />
              </div>
            )}
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Ажилтан</th><th className="py-2 text-right font-medium">Цалин</th><th className="py-2 text-right font-medium">НДШ</th><th className="py-2 text-right font-medium">ХХОАТ</th><th className="py-2 text-right font-medium">Кассын суутгал</th><th className="py-2 text-right font-medium">Гарт</th></tr></thead>
              <tbody>
                {preview?.items.map((i) => (
                  <tr key={i.employeeId} className="border-b">
                    <td className="py-1.5">{i.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatMnt(i.grossMnt, { symbol: false })}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatMnt(i.employeeNdshMnt, { symbol: false })}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatMnt(i.pitMnt, { symbol: false })}</td>
                    <td className={`py-1.5 text-right tabular-nums ${BigInt(i.deductionMnt) > 0n ? 'text-destructive' : 'text-muted-foreground'}`}>{BigInt(i.deductionMnt) > 0n ? formatMnt(i.deductionMnt, { symbol: false }) : '—'}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{formatMnt(i.netMnt, { symbol: false })}</td>
                  </tr>
                ))}
                {(!preview || preview.items.length === 0) && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Цалинтай идэвхтэй ажилтан алга — &quot;Ажилтны цалин&quot;-аас тохируулна уу</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">Тооцооны түүх</h2>
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border bg-background/50 p-3 text-sm">
                  <div><div className="font-medium">{r.period}</div><div className="text-xs text-muted-foreground">Гарт {formatMnt(r.netMnt)}</div></div>
                  <button onClick={() => act(() => payrollApi.reverse(r.id), 'Тооцоо буцаагдлаа')} disabled={busy} title="Буцаах" className="text-muted-foreground hover:text-destructive disabled:opacity-50"><RotateCcw size={14} /></button>
                </div>
              ))}
              {runs.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Тооцоо алга</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'staff' && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-muted-foreground" /> Ажилтны сарын суурь цалин</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 font-medium">Ажилтан</th><th className="py-2 font-medium">Төлөв</th><th className="py-2 text-right font-medium">Сарын цалин</th><th className="py-2" /></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">{e.lastName} {e.firstName}{e.employeeCode && <span className="ml-1 text-xs text-muted-foreground">{e.employeeCode}</span>}</td>
                  <td className="py-2 text-xs text-muted-foreground">{e.status}</td>
                  <td className="py-2 text-right tabular-nums">
                    {editId === e.id ? (
                      <input autoFocus value={editVal} onChange={(ev) => setEditVal(ev.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="w-32 rounded-lg border bg-background px-2 py-1 text-right text-sm" />
                    ) : formatMnt(e.baseSalaryMnt)}
                  </td>
                  <td className="py-2 text-right">
                    {editId === e.id ? (
                      <button onClick={() => act(() => payrollApi.setSalary(e.id, editVal || '0'), 'Цалин шинэчлэгдлээ').then(() => setEditId(null))} disabled={busy} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">Хадгалах</button>
                    ) : (
                      <button onClick={() => { setEditId(e.id); setEditVal(e.baseSalaryMnt); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Pencil size={13} /> Засах</button>
                    )}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Ажилтан алга</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cls ?? ''}`}>{value}</div>
    </div>
  );
}
