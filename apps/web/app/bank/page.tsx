'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Landmark, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { BANK_MATCH_LABEL, BANK_MATCH_TYPES, type BankMatchType, formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { type Account, accountingApi } from '@/lib/accounting-api';
import { type BankStatementDetail, type BankStatementRow, type BankTxn, bankApi, parseStatementFile } from '@/lib/bank-api';
import { type Customer, customersApi } from '@/lib/customers-api';
import { procurementApi, type Supplier } from '@/lib/procurement-api';

export default function BankStatementPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<BankStatementRow[]>([]);
  const [detail, setDetail] = useState<BankStatementDetail | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reloadList = useCallback(async () => setList(await bankApi.list()), []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    Promise.all([
      bankApi.list(),
      customersApi.list().catch(() => []),
      procurementApi.suppliers().catch(() => []),
      accountingApi.accounts().catch(() => []),
    ])
      .then(([l, c, s, a]) => { setList(l); setCustomers(c); setSuppliers(s); setAccounts(a); })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  const postable = useMemo(() => accounts.filter((a) => a.isPostable && a.isActive), [accounts]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const parsed = await parseStatementFile(file);
      if (parsed.transactions.length === 0) throw new Error('Файлаас гүйлгээ олдсонгүй — Хаанбанкны хуулга мөн эсэхийг шалгана уу');
      if (!parsed.accountNumber) {
        const n = window.prompt('Файлын нэрнээс дансны дугаар танигдсангүй. Дансны дугаараа оруулна уу:');
        if (!n) { setBusy(false); return; }
        parsed.accountNumber = n.trim();
      }
      const d = await bankApi.import({ ...parsed, glAccountCode: '1110' });
      setDetail(d);
      await reloadList();
      setMsg(`${d.transactions.length} гүйлгээ импортлогдлоо`);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : e instanceof Error ? e.message : 'Импорт амжилтгүй');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(null); setMsg(null);
    try {
      await fn();
      if (detail) setDetail(await bankApi.get(detail.id));
      await reloadList();
      setMsg(ok);
    } catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={Landmark} title="Банкны хуулга" subtitle="Excel хуулга оруулж, гүйлгээ бүрийг тааруулан Ерөнхий дэвтэрт бүртгэнэ">
        {!detail && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
              <Upload size={16} /> {busy ? 'Уншиж байна…' : 'Хуулга оруулах'}
            </button>
          </>
        )}
        {detail && (
          <button onClick={() => setDetail(null)} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-accent">
            <ArrowLeft size={16} /> Жагсаалт руу
          </button>
        )}
      </PageHeader>

      {error && <p className="mb-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      {!detail ? (
        <StatementList list={list} busy={busy} onOpen={async (id) => setDetail(await bankApi.get(id))} onDelete={(id) => act(() => bankApi.remove(id), 'Хуулга устгагдлаа')} />
      ) : (
        <StatementDetail
          d={detail}
          busy={busy}
          customers={customers}
          suppliers={suppliers}
          accounts={postable}
          onUpdate={(txnId, body) => act(() => bankApi.updateTxn(txnId, body), 'Хадгаллаа')}
          onPost={() => act(async () => {
            const r = await bankApi.post(detail.id);
            setMsg(`${r.posted} гүйлгээ бүртгэгдлээ${r.skipped ? `, ${r.skipped} тооцоогүй` : ''}`);
          }, 'Бүртгэгдлээ')}
        />
      )}
    </main>
  );
}

function StatementList({ list, busy, onOpen, onDelete }: { list: BankStatementRow[]; busy: boolean; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  if (list.length === 0) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center">
        <FileSpreadsheet size={32} className="mb-2 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Хуулга оруулаагүй байна.</p>
        <p className="mt-1 text-xs text-muted-foreground">Хаанбанкны Excel хуулгыг (Statement_MNT_xxxx.xlsx) оруулна уу.</p>
      </div>
    );
  }
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 font-medium">Данс</th>
            <th className="py-2 font-medium">Хугацаа</th>
            <th className="py-2 font-medium">Файл</th>
            <th className="py-2 text-right font-medium">Гүйлгээ</th>
            <th className="py-2 text-right font-medium">Бүртгэсэн</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const done = s.postedCount >= s.txnCount && s.txnCount > 0;
            return (
              <tr key={s.id} onDoubleClick={() => onOpen(s.id)} className="cursor-pointer border-b transition hover:bg-accent/50" title="Нээх (2 удаа дарна)">
                <td className="py-2 font-medium">{s.accountNumber} <span className="text-xs text-muted-foreground">{s.currency}</span></td>
                <td className="py-2 text-muted-foreground">{s.dateFrom?.slice(0, 10) ?? '—'} … {s.dateTo?.slice(0, 10) ?? '—'}</td>
                <td className="py-2 text-xs text-muted-foreground">{s.filename || '—'}</td>
                <td className="py-2 text-right tabular-nums">{s.txnCount}</td>
                <td className={`py-2 text-right tabular-nums ${done ? 'text-emerald-600' : 'text-amber-600'}`}>{s.postedCount}</td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onOpen(s.id); }} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent">Нээх</button>
                    {s.postedCount === 0 && (
                      <button onClick={(e) => { e.stopPropagation(); if (window.confirm('Энэ хуулгыг устгах уу?')) onDelete(s.id); }} disabled={busy} title="Устгах" className="text-muted-foreground hover:text-destructive disabled:opacity-50"><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function StatementDetail({
  d, busy, customers, suppliers, accounts, onUpdate, onPost,
}: {
  d: BankStatementDetail;
  busy: boolean;
  customers: Customer[];
  suppliers: Supplier[];
  accounts: Account[];
  onUpdate: (txnId: string, body: unknown) => void;
  onPost: () => void;
}) {
  const pending = d.transactions.filter((t) => !t.postedAt);
  const readyToPost = pending.filter((t) => t.matchType).length;

  return (
    <>
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Орлого (кредит)" value={formatMnt(d.totals.creditMnt)} cls="text-emerald-600" />
        <Stat label="Зарлага (дебет)" value={formatMnt(d.totals.debitMnt)} cls="text-destructive" />
        <Stat label="Тааруулсан" value={`${d.totals.matchedCount} / ${d.transactions.length}`} />
        <Stat label="Бүртгэсэн" value={`${d.totals.postedCount} / ${d.transactions.length}`} />
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Данс <span className="font-medium text-foreground">{d.accountNumber}</span> · {d.dateFrom?.slice(0, 10)} … {d.dateTo?.slice(0, 10)}
        </div>
        <button onClick={onPost} disabled={busy || readyToPost === 0} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
          Ерөнхий дэвтэрт бүртгэх ({readyToPost})
        </button>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 font-medium">Огноо</th>
                <th className="py-2 font-medium">Банкны утга</th>
                <th className="py-2 text-right font-medium">Орлого</th>
                <th className="py-2 text-right font-medium">Зарлага</th>
                <th className="py-2 font-medium">Төрөл</th>
                <th className="py-2 font-medium">Тал / данс</th>
                <th className="py-2 font-medium">Тайлбар</th>
              </tr>
            </thead>
            <tbody>
              {d.transactions.map((t, i) => (
                <TxnRow key={t.id} t={t} zebra={i % 2 === 1} busy={busy} customers={customers} suppliers={suppliers} accounts={accounts} onUpdate={onUpdate} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TxnRow({
  t, zebra, busy, customers, suppliers, accounts, onUpdate,
}: {
  t: BankTxn;
  zebra: boolean;
  busy: boolean;
  customers: Customer[];
  suppliers: Supplier[];
  accounts: Account[];
  onUpdate: (txnId: string, body: unknown) => void;
}) {
  const [matchType, setMatchType] = useState<BankMatchType | ''>(t.matchType ?? '');
  const [party, setParty] = useState(t.customerId ?? t.supplierId ?? t.accountCode ?? '');
  const [desc, setDesc] = useState(t.description);
  const posted = !!t.postedAt;

  function save(next: Partial<{ matchType: BankMatchType | ''; party: string; desc: string }>) {
    const mt = next.matchType ?? matchType;
    const p = next.party !== undefined ? next.party : party;
    const dsc = next.desc ?? desc;
    if (!mt) return;
    onUpdate(t.id, {
      matchType: mt,
      description: dsc,
      customerId: mt === 'CUSTOMER_PAYMENT' ? p : null,
      supplierId: mt === 'SUPPLIER_PAYMENT' ? p : null,
      accountCode: mt === 'GL_ENTRY' ? p : null,
    });
  }

  const options =
    matchType === 'CUSTOMER_PAYMENT' ? customers.map((c) => ({ v: c.id, l: c.name }))
    : matchType === 'SUPPLIER_PAYMENT' ? suppliers.map((s) => ({ v: s.id, l: s.name }))
    : matchType === 'GL_ENTRY' ? accounts.map((a) => ({ v: a.code, l: `${a.code} ${a.name}` }))
    : [];

  return (
    <tr className={`border-b align-top ${zebra ? 'bg-muted/25' : ''} ${posted ? 'opacity-60' : ''}`}>
      <td className="whitespace-nowrap py-2 text-muted-foreground">{t.txnDate.slice(0, 10)}</td>
      <td className="py-2">
        <div className="max-w-[22rem] truncate" title={t.bankDescription}>{t.bankDescription || '—'}</div>
        <div className="text-xs text-muted-foreground">
          {t.bankCounterpart && <span>{t.bankCounterpart}</span>}
          {t.isFee && <span className="ml-1 rounded bg-amber-500/15 px-1 text-amber-700">шимтгэл</span>}
          {t.isSettlement && <span className="ml-1 rounded bg-blue-500/15 px-1 text-blue-700">ПОС</span>}
          {posted && <span className="ml-1 rounded bg-emerald-500/15 px-1 text-emerald-700">бүртгэсэн</span>}
        </div>
      </td>
      <td className="py-2 text-right font-medium tabular-nums text-emerald-600">{t.creditMnt !== '0' ? formatMnt(t.creditMnt, { symbol: false }) : ''}</td>
      <td className="py-2 text-right font-medium tabular-nums text-destructive">{t.debitMnt !== '0' ? formatMnt(t.debitMnt, { symbol: false }) : ''}</td>
      <td className="py-2">
        <select
          value={matchType}
          disabled={posted || busy}
          onChange={(e) => { const v = e.target.value as BankMatchType | ''; setMatchType(v); setParty(''); if (v === 'IGNORED') save({ matchType: v, party: '' }); }}
          className="min-h-touch w-full rounded-lg border bg-background px-2 text-xs disabled:opacity-60"
        >
          <option value="">— сонгох —</option>
          {BANK_MATCH_TYPES.map((m) => <option key={m} value={m}>{BANK_MATCH_LABEL[m]}</option>)}
        </select>
      </td>
      <td className="py-2">
        {options.length > 0 ? (
          <select
            value={party}
            disabled={posted || busy}
            onChange={(e) => { setParty(e.target.value); save({ party: e.target.value }); }}
            className="min-h-touch w-full max-w-[14rem] rounded-lg border bg-background px-2 text-xs disabled:opacity-60"
          >
            <option value="">— сонгох —</option>
            {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : (
          <span className="text-xs text-muted-foreground">{t.customer?.name ?? t.supplier?.name ?? t.accountCode ?? '—'}</span>
        )}
      </td>
      <td className="py-2">
        <input
          value={desc}
          disabled={posted || busy}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => { if (matchType && desc !== t.description) save({ desc }); }}
          placeholder="тайлбар"
          className="min-h-touch w-full max-w-[14rem] rounded-lg border bg-background px-2 text-xs disabled:opacity-60"
        />
      </td>
    </tr>
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
