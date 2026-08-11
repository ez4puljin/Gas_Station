'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Printer, Search, Trash2, Wallet, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { ACCOUNT_MATCH_MODES } from '@fuel/schemas';
import { ACCOUNT_TYPE_LABEL, type AccountType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type Account, accountingApi } from '@/lib/accounting-api';
import { posApi, type StationDto } from '@/lib/pos-api';

const TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

/** Шинж — Монгол нягтлангийн хэлбэр: дебет талын данс = Актив, кредит талын = Пассив. */
function natureLabel(a: Account): string {
  return a.normalSide === 'DEBIT' ? 'Актив' : 'Пассив';
}

interface Filters {
  q: string;
  mode: string;
  type: string;
  stationId: string;
  includeInactive: boolean;
}
const EMPTY: Filters = { q: '', mode: 'contains', type: '', stationId: '', includeInactive: false };

export default function AccountsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Account[]>([]);
  const [stations, setStations] = useState<StationDto[]>([]);
  // `draft` = маягт дээрх утга, `applied` = "Хайх" дарсны дараа хэрэглэгдэх утга
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (f: Filters) => {
    const q: Record<string, string> = { mode: f.mode };
    if (f.q) q.q = f.q;
    if (f.type) q.type = f.type;
    if (f.stationId) q.stationId = f.stationId;
    if (f.includeInactive) q.includeInactive = 'true';
    setRows(await accountingApi.accounts(q));
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    Promise.all([accountingApi.accounts({}), posApi.stations().catch(() => [])])
      .then(([a, s]) => { setRows(a); setStations(s); })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await load(applied); setMsg(ok); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  function runSearch() {
    setApplied(draft);
    void load(draft).catch(() => setError('Хайлт амжилтгүй'));
  }

  // Мод — эцгээр нь эрэмбэлж, гүнээр нь догол мөр өгнө
  const tree = useMemo(() => buildTree(rows), [rows]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={Wallet} title="Данс" subtitle="Дансны нэгдсэн төлөвлөгөө — нэмэх, засах, устгах">
        <button onClick={() => window.print()} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-accent">
          <Printer size={16} /> Хэвлэх
        </button>
        <button onClick={() => setCreating(true)} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105">
          <Plus size={16} /> Шинэ
        </button>
      </PageHeader>

      {error && <p className="no-print mb-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</p>}
      {msg && <p className="no-print mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      {/* ── Хайлтын мөр ── */}
      <section className="no-print mb-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Хайлт</span>
            <input
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Хайх утга…"
              className="min-h-touch w-56 rounded-xl border bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Тохирол</span>
            <select value={draft.mode} onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
              {ACCOUNT_MATCH_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Шинж</span>
            <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} className="min-h-touch w-48 rounded-xl border bg-background px-3 text-sm">
              <option value="">— бүгд —</option>
              {TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Салбар</span>
            <select value={draft.stationId} onChange={(e) => setDraft((d) => ({ ...d, stationId: e.target.value }))} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
              <option value="">— бүгд —</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" checked={draft.includeInactive} onChange={(e) => setDraft((d) => ({ ...d, includeInactive: e.target.checked }))} className="accent-primary" />
            Идэвхгүйг харуулах
          </label>
          <button onClick={runSearch} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
            <Search size={15} /> Хайх
          </button>
          <button onClick={() => { setDraft(EMPTY); setApplied(EMPTY); void load(EMPTY); }} className="min-h-touch rounded-xl border px-3 text-sm hover:bg-accent">
            Цэвэрлэх
          </button>
        </div>
      </section>

      {/* ── Хүснэгт (хэвлэгдэнэ) ── */}
      <section className="print-area rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 hidden text-center print:block">
          <h2 className="text-lg font-bold">Дансны нэгдсэн төлөвлөгөө</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="no-print w-16 py-2 pl-2 font-medium" />
                <th className="w-40 py-2 font-medium">Дугаар</th>
                <th className="py-2 font-medium">Нэр</th>
                <th className="w-24 py-2 font-medium">Валют</th>
                <th className="w-28 py-2 font-medium">Шинж</th>
                <th className="w-52 py-2 font-medium">Журнал</th>
                <th className="w-44 py-2 font-medium">Салбар</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(({ a, depth }) => {
                const group = !a.isPostable;
                return (
                  <tr key={a.id} className={`border-b ${group ? 'bg-muted/30 font-semibold' : ''} ${!a.isActive ? 'opacity-50' : ''}`}>
                    <td className="no-print py-1.5 pl-2">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditing(a)} title="Засах" className="text-muted-foreground hover:text-primary"><Pencil size={13} /></button>
                        <button
                          onClick={() => { if (window.confirm(`"${a.code} ${a.name}" дансыг устгах уу?`)) void act(() => accountingApi.deleteAccount(a.id), 'Данс устгагдлаа'); }}
                          disabled={busy}
                          title="Устгах"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="py-1.5 font-mono tabular-nums" style={{ paddingLeft: `${depth * 18}px` }}>{a.code}</td>
                    <td className="py-1.5">
                      {a.name}
                      {!a.isActive && <span className="ml-1 text-xs font-normal text-muted-foreground">(идэвхгүй)</span>}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{group ? '' : a.currency}</td>
                    <td className="py-1.5 text-muted-foreground">{group ? '' : natureLabel(a)}</td>
                    <td className="py-1.5 text-muted-foreground">{a.journalName ?? ''}</td>
                    <td className="py-1.5 text-muted-foreground">{a.station ? `${a.station.code} — ${a.station.name}` : group ? '' : 'Үндсэн байгууллага'}</td>
                  </tr>
                );
              })}
              {tree.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Данс олдсонгүй</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Нийт {tree.length} данс</p>
      </section>

      {(creating || editing) && (
        <AccountModal
          account={editing}
          accounts={rows}
          stations={stations}
          busy={busy}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (body) => {
            await act(
              () => (editing ? accountingApi.updateAccount(editing.id, body) : accountingApi.createAccount(body)),
              editing ? 'Данс шинэчлэгдлээ' : 'Данс нэмэгдлээ',
            );
            setCreating(false); setEditing(null);
          }}
        />
      )}
    </main>
  );
}

/** Эцэг-хүүхдийн модыг кодоор эрэмбэлж, гүнтэй жагсаалт болгоно. */
function buildTree(rows: Account[]): { a: Account; depth: number }[] {
  const byParent = new Map<string | null, Account[]>();
  for (const a of rows) {
    const k = a.parentId ?? null;
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(a);
  }
  for (const list of byParent.values()) list.sort((x, y) => x.code.localeCompare(y.code, 'en', { numeric: true }));

  const out: { a: Account; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const a of byParent.get(parentId) ?? []) {
      if (seen.has(a.id)) continue; // мөчлөгөөс хамгаална
      seen.add(a.id);
      out.push({ a, depth });
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  // Эцэг нь шүүлтээр хасагдсан данс (өнчин) — гүн 0-оор нэмнэ
  for (const a of rows) if (!seen.has(a.id)) out.push({ a, depth: 0 });
  return out;
}

function AccountModal({
  account, accounts, stations, busy, onClose, onSave,
}: {
  account: Account | null;
  accounts: Account[];
  stations: StationDto[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const isEdit = !!account;
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>((account?.type as AccountType) ?? 'ASSET');
  const [parentCode, setParentCode] = useState(accounts.find((x) => x.id === account?.parentId)?.code ?? '');
  const [currency, setCurrency] = useState(account?.currency ?? 'MNT');
  const [journalName, setJournalName] = useState(account?.journalName ?? '');
  const [stationId, setStationId] = useState(account?.stationId ?? '');
  const [isPostable, setIsPostable] = useState(account?.isPostable ?? true);
  const [isActive, setIsActive] = useState(account?.isActive ?? true);

  const groups = accounts.filter((a) => !a.isPostable && a.id !== account?.id);
  const valid = isEdit ? name.trim().length > 0 : code.trim().length > 0 && name.trim().length > 0;

  function submit() {
    if (!valid) return;
    onSave(
      isEdit
        ? { name, currency, journalName: journalName || null, stationId: stationId || null, isPostable, isActive }
        : { code, name, type, parentCode: parentCode || undefined, currency, journalName: journalName || null, stationId: stationId || null, isPostable },
    );
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8">
        <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-base font-semibold">{isEdit ? 'Данс засах' : 'Шинэ данс'}</h2>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><X size={18} /></button>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Дугаар</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="110108" className="min-h-touch w-full rounded-xl border bg-background px-3 font-mono text-sm disabled:opacity-60" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Валют</span>
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="MNT" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Нэр</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Хаан банк — 5301234567" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
            </label>
            {!isEdit && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Шинж (төрөл)</span>
                  <select value={type} onChange={(e) => setType(e.target.value as AccountType)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm">
                    {TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Эцэг данс</span>
                  <select value={parentCode} onChange={(e) => setParentCode(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm">
                    <option value="">— үгүй —</option>
                    {groups.map((g) => <option key={g.id} value={g.code}>{g.code} {g.name}</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Журнал</span>
                <input value={journalName} onChange={(e) => setJournalName(e.target.value)} placeholder="Мөнгөн хөрөнгө харилцах" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Салбар</span>
                <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm">
                  <option value="">Үндсэн байгууллага</option>
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                <input type="checkbox" checked={isPostable} onChange={(e) => setIsPostable(e.target.checked)} className="accent-primary" />
                Бичилт хийх боломжтой
                <span className="text-xs text-muted-foreground">(бүлэг данс бол унтраа)</span>
              </label>
              {isEdit && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-primary" />
                  Идэвхтэй
                </label>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-4">
            <button onClick={onClose} className="min-h-touch rounded-xl border px-4 text-sm font-medium hover:bg-accent">Болих</button>
            <button onClick={submit} disabled={busy || !valid} className="min-h-touch rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-50">
              {isEdit ? 'Хадгалах' : 'Нэмэх'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
