'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, CheckCircle2, FileText, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { formatMnt } from '@fuel/schemas';
import { ACCOUNT_TYPE_LABEL, type AccountType, JOURNAL_SOURCE_LABEL } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type Account, accountingApi, type JournalEntry } from '@/lib/accounting-api';

function monthRange() {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    from: new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: ub.toISOString().slice(0, 10),
  };
}
const toB = (s: string) => {
  try { return BigInt(s || '0'); } catch { return 0n; }
};

interface DraftLine { key: string; accountCode: string; debit: string; credit: string; memo: string }
let seq = 0;
const newLine = (): DraftLine => ({ key: `l${++seq}`, accountCode: '', debit: '', credit: '', memo: '' });

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function AccountingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [range] = useState(monthRange());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  // journal form
  const [jDate, setJDate] = useState(monthRange().to);
  const [jMemo, setJMemo] = useState('');
  const [jLines, setJLines] = useState<DraftLine[]>([newLine(), newLine()]);

  const reload = useCallback(async () => {
    const [acc, ent] = await Promise.all([
      accountingApi.accounts(),
      accountingApi.journal(range).catch(() => []),
    ]);
    setAccounts(acc);
    setEntries(ent);
  }, [range]);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    reload()
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа гарлаа'); })
      .finally(() => setReady(true));
  }, [router, reload]);

  const postable = useMemo(() => accounts.filter((a) => a.isPostable && a.isActive), [accounts]);
  const grouped = useMemo(() => {
    const g: Record<string, Account[]> = {};
    for (const a of accounts) (g[a.type] = g[a.type] ?? []).push(a);
    return g;
  }, [accounts]);

  const totals = useMemo(() => {
    let d = 0n, c = 0n;
    for (const l of jLines) { d += toB(l.debit); c += toB(l.credit); }
    return { d, c, balanced: d === c && d > 0n };
  }, [jLines]);

  async function setup() {
    setBusy(true); setError(null);
    try { const r = await accountingApi.setup(); await reload(); setMsg(`Дансны төлөвлөгөө бэлэн (${r.created} данс)`); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  async function submitJournal() {
    const lines = jLines.filter((l) => l.accountCode && (toB(l.debit) > 0n || toB(l.credit) > 0n));
    if (!totals.balanced || lines.length < 2) { setError('Нийт дебет = нийт кредит, дор хаяж 2 мөр'); return; }
    setBusy(true); setError(null);
    try {
      await accountingApi.createEntry({
        date: jDate, memo: jMemo || undefined,
        lines: lines.map((l) => ({ accountCode: l.accountCode, debitMnt: toB(l.debit) > 0n ? l.debit : undefined, creditMnt: toB(l.credit) > 0n ? l.credit : undefined, memo: l.memo || undefined })),
      });
      setCreating(false); setJMemo(''); setJLines([newLine(), newLine()]);
      await reload(); setMsg('Журнал бичигдлээ');
    } catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  async function reverse(id: string) {
    setBusy(true); setError(null);
    try { await accountingApi.reverse(id); await reload(); setMsg('Журнал буцаагдлаа'); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={BookOpen} title="Нягтлан бодох бүртгэл" subtitle="Ерөнхий дэвтэр (GL) — дансны төлөвлөгөө, журнал, санхүүгийн тайлан">
        <Link href="/reports/financial" className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm transition hover:bg-accent">
          <FileText size={16} /> Санхүүгийн тайлан
        </Link>
        {accounts.length > 0 && (
          <button onClick={() => { setCreating(true); setError(null); }} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105">
            <Plus size={16} /> Шинэ журнал
          </button>
        )}
      </PageHeader>

      {error && !creating && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      {accounts.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center">
          <BookOpen size={32} className="mb-2 text-muted-foreground/40" />
          <p className="mb-3 text-sm text-muted-foreground">Дансны төлөвлөгөө хараахан үүсээгүй байна.</p>
          <button onClick={setup} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
            <Plus size={16} /> Өгөгдмөл дансны төлөвлөгөө үүсгэх
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[460px_1fr]">
          {/* Дансны төлөвлөгөө */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">Дансны төлөвлөгөө ({accounts.length})</h2>
            <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
              {TYPE_ORDER.map((t) => (grouped[t] ?? []).length > 0 && (
                <div key={t}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{ACCOUNT_TYPE_LABEL[t]}</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(grouped[t] ?? []).map((a) => (
                        <tr key={a.id} className={a.isPostable ? '' : 'font-semibold'}>
                          <td className="w-16 py-0.5 pr-2 font-mono text-xs text-muted-foreground">{a.code}</td>
                          <td className={`py-0.5 ${a.isPostable ? 'pl-2' : ''}`}>{a.name}{!a.isActive && <span className="ml-1 text-xs text-muted-foreground">(идэвхгүй)</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {/* Сүүлийн журналууд */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">Журнал ({entries.length}) — {range.from} … {range.to}</h2>
            <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
              {entries.map((e) => {
                const td = e.lines.reduce((s, l) => s + toB(l.debitMnt), 0n);
                return (
                  <div key={e.id} className="rounded-xl border bg-background/50 p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-primary">{e.entryNo}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{JOURNAL_SOURCE_LABEL[e.source as keyof typeof JOURNAL_SOURCE_LABEL] ?? e.source}</span>
                      <span className="text-xs text-muted-foreground">{new Date(e.date).toLocaleDateString('mn-MN')}</span>
                      {e.memo && <span className="text-sm">{e.memo}</span>}
                      <span className="ml-auto text-sm font-semibold tabular-nums">{formatMnt(td)}</span>
                      {!e.reversedId && e.source !== 'ADJUSTMENT' && (
                        <button onClick={() => reverse(e.id)} disabled={busy} title="Буцаах" className="text-muted-foreground hover:text-destructive disabled:opacity-50"><RotateCcw size={14} /></button>
                      )}
                      {e.reversedId && <span className="text-[11px] text-muted-foreground">(буцаагдсан)</span>}
                    </div>
                    <table className="mt-1.5 w-full text-xs">
                      <tbody>
                        {e.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="py-0.5 text-muted-foreground"><span className="font-mono">{l.account?.code}</span> {l.account?.name}</td>
                            <td className="py-0.5 text-right tabular-nums">{toB(l.debitMnt) > 0n ? formatMnt(l.debitMnt, { symbol: false }) : ''}</td>
                            <td className="py-0.5 text-right tabular-nums text-muted-foreground">{toB(l.creditMnt) > 0n ? formatMnt(l.creditMnt, { symbol: false }) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {entries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Журнал алга</p>}
            </div>
          </section>
        </div>
      )}

      {creating && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8">
            <div className="w-full max-w-2xl rounded-2xl border bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="text-base font-semibold">Шинэ журналын бичилт</h2>
                <button onClick={() => setCreating(false)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><X size={18} /></button>
              </div>
              <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
                {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Огноо</span>
                    <input type="date" value={jDate} onChange={(e) => setJDate(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" /></label>
                  <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Тайлбар</span>
                    <input value={jMemo} onChange={(e) => setJMemo(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" /></label>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-1 font-medium">Данс</th><th className="pb-1 text-right font-medium">Дебет</th><th className="pb-1 text-right font-medium">Кредит</th><th /></tr></thead>
                  <tbody>
                    {jLines.map((l) => (
                      <tr key={l.key}>
                        <td className="py-1 pr-1">
                          <select value={l.accountCode} onChange={(e) => setJLines((p) => p.map((x) => x.key === l.key ? { ...x, accountCode: e.target.value } : x))} className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm">
                            <option value="">— данс —</option>
                            {postable.map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-1"><input inputMode="numeric" value={l.debit} onChange={(e) => setJLines((p) => p.map((x) => x.key === l.key ? { ...x, debit: e.target.value.replace(/[^\d]/g, ''), credit: '' } : x))} placeholder="0" className="min-h-touch w-28 rounded-lg border bg-background px-2 text-right text-sm" /></td>
                        <td className="py-1 px-1"><input inputMode="numeric" value={l.credit} onChange={(e) => setJLines((p) => p.map((x) => x.key === l.key ? { ...x, credit: e.target.value.replace(/[^\d]/g, ''), debit: '' } : x))} placeholder="0" className="min-h-touch w-28 rounded-lg border bg-background px-2 text-right text-sm" /></td>
                        <td className="py-1">{jLines.length > 2 && <button onClick={() => setJLines((p) => p.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold"><td className="py-1.5">Нийт</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMnt(totals.d, { symbol: false })}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMnt(totals.c, { symbol: false })}</td><td /></tr>
                  </tfoot>
                </table>
                <button onClick={() => setJLines((p) => [...p, newLine()])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"><Plus size={14} /> Мөр нэмэх</button>
                <p className={`text-sm ${totals.balanced ? 'text-emerald-600' : 'text-amber-600'}`}>{totals.balanced ? '✓ Тэнцсэн' : `Зөрүү: ${formatMnt(totals.d - totals.c)}`}</p>
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-4">
                <button onClick={() => setCreating(false)} className="min-h-touch rounded-xl border px-4 text-sm font-medium hover:bg-accent">Болих</button>
                <button onClick={submitJournal} disabled={busy || !totals.balanced} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Бичих</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </main>
  );
}
