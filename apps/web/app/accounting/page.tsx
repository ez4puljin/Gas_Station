'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { defaultRange, ReportFilters } from '@/components/report-filters';
import { formatMnt } from '@fuel/schemas';
import { ACCOUNT_TYPE_LABEL, type AccountType, JOURNAL_SOURCE_LABEL } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type Account, accountingApi, type JournalEntry, type TrialBalance } from '@/lib/accounting-api';

const toB = (s: string | bigint) => {
  try { return typeof s === 'bigint' ? s : BigInt(s || '0'); } catch { return 0n; }
};
const cell = (v: bigint) => (v === 0n ? '' : formatMnt(v, { symbol: false }));

interface DraftLine { key: string; accountCode: string; debit: string; credit: string; memo: string }
let seq = 0;
const newLine = (): DraftLine => ({ key: `l${++seq}`, accountCode: '', debit: '', credit: '', memo: '' });

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function AccountingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [range, setRange] = useState(defaultRange);
  const [stationId, setStationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  // харагдац
  const [onlyMoved, setOnlyMoved] = useState(true);
  const [jq, setJq] = useState('');
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  // журналын маягт
  const [jDate, setJDate] = useState(() => defaultRange().to);
  const [jMemo, setJMemo] = useState('');
  const [jLines, setJLines] = useState<DraftLine[]>([newLine(), newLine()]);

  const reload = useCallback(async (from: string, to: string, sid: string) => {
    const f = { from, to, ...(sid ? { stationId: sid } : {}) };
    const [acc, ent, trial] = await Promise.all([
      accountingApi.accounts(),
      accountingApi.journal(f).catch(() => []),
      accountingApi.trialBalance(f).catch(() => null),
    ]);
    setAccounts(acc); setEntries(ent); setTb(trial);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    reload(range.from, range.to, stationId)
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа гарлаа'); })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (ready) void reload(range.from, range.to, stationId).catch(() => setError('Ачаалахад алдаа гарлаа'));
  }, [ready, range, stationId, reload]);

  const postable = useMemo(() => accounts.filter((a) => a.isPostable && a.isActive), [accounts]);

  /** Данс бүрийг мужийн гүйлгээтэй нь хослуулж, төрлөөр бүлэглэнэ. */
  const groups = useMemo(() => {
    const move = new Map((tb?.rows ?? []).map((r) => [r.code, r]));
    const out: { type: AccountType; rows: (Account & { d: bigint; c: bigint })[]; d: bigint; c: bigint }[] = [];
    for (const t of TYPE_ORDER) {
      const rows = accounts
        .filter((a) => a.type === t)
        .map((a) => {
          const m = move.get(a.code);
          return { ...a, d: toB(m?.debitMnt ?? '0'), c: toB(m?.creditMnt ?? '0') };
        })
        .filter((a) => (onlyMoved ? a.d !== 0n || a.c !== 0n : true));
      if (rows.length === 0) continue;
      out.push({
        type: t,
        rows,
        d: rows.reduce((s, r) => s + r.d, 0n),
        c: rows.reduce((s, r) => s + r.c, 0n),
      });
    }
    return out;
  }, [accounts, tb, onlyMoved]);

  const filteredEntries = useMemo(() => {
    const n = jq.trim().toLowerCase();
    if (!n) return entries;
    return entries.filter(
      (e) =>
        e.entryNo.toLowerCase().includes(n) ||
        (e.memo ?? '').toLowerCase().includes(n) ||
        e.lines.some((l) => `${l.account?.code} ${l.account?.name}`.toLowerCase().includes(n)),
    );
  }, [entries, jq]);

  const journalTotal = useMemo(
    () => filteredEntries.reduce((s, e) => s + e.lines.reduce((x, l) => x + toB(l.debitMnt), 0n), 0n),
    [filteredEntries],
  );

  const draftTotals = useMemo(() => {
    let d = 0n, c = 0n;
    for (const l of jLines) { d += toB(l.debit); c += toB(l.credit); }
    return { d, c, balanced: d === c && d > 0n };
  }, [jLines]);

  async function setup() {
    setBusy(true); setError(null);
    try { const r = await accountingApi.setup(); await reload(range.from, range.to, stationId); setMsg(`Дансны төлөвлөгөө бэлэн (${r.created} данс)`); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  async function submitJournal() {
    const lines = jLines.filter((l) => l.accountCode && (toB(l.debit) > 0n || toB(l.credit) > 0n));
    if (!draftTotals.balanced || lines.length < 2) { setError('Нийт дебет = нийт кредит, дор хаяж 2 мөр'); return; }
    setBusy(true); setError(null);
    try {
      await accountingApi.createEntry({
        date: jDate, memo: jMemo || undefined,
        lines: lines.map((l) => ({ accountCode: l.accountCode, debitMnt: toB(l.debit) > 0n ? l.debit : undefined, creditMnt: toB(l.credit) > 0n ? l.credit : undefined, memo: l.memo || undefined })),
      });
      setCreating(false); setJMemo(''); setJLines([newLine(), newLine()]);
      await reload(range.from, range.to, stationId); setMsg('Журнал бичигдлээ');
    } catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  async function reverse(id: string) {
    setBusy(true); setError(null);
    try { await accountingApi.reverse(id); await reload(range.from, range.to, stationId); setMsg('Журнал буцаагдлаа'); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={BookOpen} title="Нягтлан бодох бүртгэл" subtitle="Ерөнхий дэвтэр — гүйлгээний баланс ба журналын бүртгэл">
        <Link href="/reports/financial" className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm transition hover:bg-accent">
          <FileText size={16} /> Санхүүгийн тайлан
        </Link>
        {accounts.length > 0 && (
          <button onClick={() => { setCreating(true); setError(null); }} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105">
            <Plus size={16} /> Шинэ журнал
          </button>
        )}
      </PageHeader>

      {accounts.length > 0 && (
        <ReportFilters range={range} onRange={setRange} stationId={stationId} onStation={setStationId} />
      )}

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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,560px)_1fr]">
          {/* ── Гүйлгээний баланс (дансны төлөвлөгөө + мужийн гүйлгээ) ── */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Гүйлгээний баланс</h2>
              <div className="flex items-center gap-2">
                {tb && (
                  tb.balanced ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 size={12} /> Тэнцсэн
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      <AlertTriangle size={12} /> Тэнцээгүй
                    </span>
                  )
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={onlyMoved} onChange={(e) => setOnlyMoved(e.target.checked)} className="accent-primary" />
                  Зөвхөн хөдөлгөөнтэй
                </label>
              </div>
            </div>

            <div className="max-h-[68vh] overflow-auto pr-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="w-14 py-1.5 text-left font-medium">Код</th>
                    <th className="py-1.5 text-left font-medium">Дансны нэр</th>
                    <th className="w-28 py-1.5 text-right font-medium">Дебет</th>
                    <th className="w-28 py-1.5 text-right font-medium">Кредит</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.type}>
                    <tr className="bg-muted/40">
                      <td colSpan={2} className="py-1 pl-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {ACCOUNT_TYPE_LABEL[g.type]}
                      </td>
                      <td className="py-1 text-right text-xs font-semibold tabular-nums">{cell(g.d)}</td>
                      <td className="py-1 text-right text-xs font-semibold tabular-nums">{cell(g.c)}</td>
                    </tr>
                    {g.rows.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-1 font-mono text-xs text-muted-foreground">{a.code}</td>
                        <td className={`py-1 ${a.isPostable ? 'pl-2' : 'font-semibold'}`}>
                          {a.name}
                          {!a.isActive && <span className="ml-1 text-xs text-muted-foreground">(идэвхгүй)</span>}
                        </td>
                        <td className="py-1 text-right tabular-nums">{cell(a.d)}</td>
                        <td className="py-1 text-right tabular-nums">{cell(a.c)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                {groups.length === 0 && (
                  <tbody>
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Энэ мужид хөдөлгөөн алга</td></tr>
                  </tbody>
                )}
                {tb && (
                  <tfoot>
                    <tr className="border-t-2 border-double font-semibold">
                      <td colSpan={2} className="py-2">НИЙТ ДҮН</td>
                      <td className="py-2 text-right tabular-nums">{cell(toB(tb.totalDebitMnt))}</td>
                      <td className="py-2 text-right tabular-nums">{cell(toB(tb.totalCreditMnt))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* ── Журналын бүртгэл ── */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Журналын бүртгэл
                <span className="ml-2 font-normal text-muted-foreground">{filteredEntries.length} бичилт</span>
              </h2>
              <label className="relative block w-56 max-w-full">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={jq} onChange={(e) => setJq(e.target.value)} placeholder="Дугаар / данс / тайлбар" className="min-h-touch w-full rounded-xl border bg-background py-1.5 pl-9 pr-3 text-sm" />
              </label>
            </div>

            <div className="max-h-[68vh] overflow-auto pr-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 text-left font-medium">Огноо</th>
                    <th className="py-1.5 text-left font-medium">Баримт</th>
                    <th className="py-1.5 text-left font-medium">Эх сурвалж</th>
                    <th className="py-1.5 text-left font-medium">Тайлбар</th>
                    <th className="w-32 py-1.5 text-right font-medium">Дүн</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, i) => {
                    const amt = e.lines.reduce((s, l) => s + toB(l.debitMnt), 0n);
                    const open = openEntry === e.id;
                    return (
                      <EntryRow
                        key={e.id}
                        e={e}
                        amt={amt}
                        zebra={i % 2 === 1}
                        open={open}
                        onToggle={() => setOpenEntry(open ? null : e.id)}
                        onReverse={() => reverse(e.id)}
                        busy={busy}
                      />
                    );
                  })}
                  {filteredEntries.length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">{jq ? 'Хайлтад тохирох бичилт алга' : 'Энэ мужид журнал алга'}</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-double font-semibold">
                    <td colSpan={4} className="py-2">НИЙТ ДҮН</td>
                    <td className="py-2 text-right tabular-nums">{cell(journalTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Мөр дээр <span className="font-medium">2 удаа дарж</span> журналын бичилтийн мөрүүдийг харна.
            </p>
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
                        <td className="px-1 py-1"><input inputMode="numeric" value={l.debit} onChange={(e) => setJLines((p) => p.map((x) => x.key === l.key ? { ...x, debit: e.target.value.replace(/[^\d]/g, ''), credit: '' } : x))} placeholder="0" className="min-h-touch w-28 rounded-lg border bg-background px-2 text-right text-sm" /></td>
                        <td className="px-1 py-1"><input inputMode="numeric" value={l.credit} onChange={(e) => setJLines((p) => p.map((x) => x.key === l.key ? { ...x, credit: e.target.value.replace(/[^\d]/g, ''), debit: '' } : x))} placeholder="0" className="min-h-touch w-28 rounded-lg border bg-background px-2 text-right text-sm" /></td>
                        <td className="py-1">{jLines.length > 2 && <button onClick={() => setJLines((p) => p.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold"><td className="py-1.5">Нийт</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMnt(draftTotals.d, { symbol: false })}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMnt(draftTotals.c, { symbol: false })}</td><td /></tr>
                  </tfoot>
                </table>
                <button onClick={() => setJLines((p) => [...p, newLine()])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"><Plus size={14} /> Мөр нэмэх</button>
                <p className={`text-sm ${draftTotals.balanced ? 'text-emerald-600' : 'text-amber-600'}`}>{draftTotals.balanced ? '✓ Тэнцсэн' : `Зөрүү: ${formatMnt(draftTotals.d - draftTotals.c)}`}</p>
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-4">
                <button onClick={() => setCreating(false)} className="min-h-touch rounded-xl border px-4 text-sm font-medium hover:bg-accent">Болих</button>
                <button onClick={submitJournal} disabled={busy || !draftTotals.balanced} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Бичих</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </main>
  );
}

/** Журналын нэг бичилт — 2 дарахад мөрүүд задарна. */
function EntryRow({
  e, amt, zebra, open, onToggle, onReverse, busy,
}: {
  e: JournalEntry;
  amt: bigint;
  zebra: boolean;
  open: boolean;
  onToggle: () => void;
  onReverse: () => void;
  busy: boolean;
}) {
  return (
    <>
      <tr
        onDoubleClick={onToggle}
        title="Мөрүүдийг харах (2 удаа дарна)"
        className={`cursor-pointer border-b transition hover:bg-accent/50 ${zebra ? 'bg-muted/25' : ''} ${open ? 'bg-accent/60' : ''}`}
      >
        <td className="whitespace-nowrap py-1.5 text-muted-foreground">{new Date(e.date).toLocaleDateString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}</td>
        <td className="py-1.5">
          <span className="inline-flex items-center gap-1">
            {open ? <ChevronDown size={12} className="shrink-0 text-primary" /> : <ChevronRight size={12} className="shrink-0 text-muted-foreground" />}
            <span className="font-mono text-xs font-semibold text-primary">{e.entryNo}</span>
          </span>
        </td>
        <td className="py-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
            {JOURNAL_SOURCE_LABEL[e.source as keyof typeof JOURNAL_SOURCE_LABEL] ?? e.source}
          </span>
        </td>
        <td className="py-1.5">
          {e.memo}
          {e.reversedId && <span className="ml-1 text-[11px] text-muted-foreground">(буцаагдсан)</span>}
        </td>
        <td className="py-1.5 text-right font-medium tabular-nums">{cell(amt)}</td>
        <td className="py-1.5 text-right">
          {!e.reversedId && e.source !== 'ADJUSTMENT' && (
            <button onClick={onReverse} disabled={busy} title="Буцаах" className="text-muted-foreground hover:text-destructive disabled:opacity-50">
              <RotateCcw size={13} />
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30">
          <td />
          <td colSpan={5} className="py-2 pr-2">
            <div className="rounded-lg border bg-card p-2">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-1 py-0.5 font-medium">Данс</th>
                    <th className="px-1 py-0.5 font-medium">Тайлбар</th>
                    <th className="px-1 py-0.5 text-right font-medium">Дебет</th>
                    <th className="px-1 py-0.5 text-right font-medium">Кредит</th>
                  </tr>
                </thead>
                <tbody>
                  {e.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-1 py-0.5">
                        <span className="font-mono text-muted-foreground">{l.account?.code}</span> {l.account?.name}
                      </td>
                      <td className="px-1 py-0.5 text-muted-foreground">{l.memo ?? ''}</td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{cell(toB(l.debitMnt))}</td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{cell(toB(l.creditMnt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
