'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Fuel, Package, Search } from 'lucide-react';
import { formatMnt, ledgerBalanceColumns, ledgerGrossColumns, type LedgerNature } from '@fuel/schemas';
import { PrintableReport } from '@/components/printable-report';
import type { LedgerRow } from '@/components/account-ledger-report';
import { exportXlsx } from '@/lib/export-xlsx';
import type { AccountRegister, AccountRegisterRow } from '@/lib/customers-api';

/**
 * Тооцооны НЭГДСЭН БҮРТГЭЛ (AR/AP) — нягтлангийн маягт.
 * Мөр бүр = нэг тал (харилцагч/нийлүүлэгч); багана = Эхний үлдэгдэл · Гүйлгээ · Эцсийн үлдэгдэл,
 * тус бүр нь Дебет/Кредит. Мөр дээр **2 удаа дарж** тухайн талын гүйлгээг задалж харна.
 *
 * Конвенцууд: тэг дүнг ХООСОН орхино; тоо баруун тэгшилсэн tabular; нийт дүн давхар зураастай.
 */

const toB = (s: string | bigint): bigint => {
  try {
    return typeof s === 'bigint' ? s : BigInt(s || '0');
  } catch {
    return 0n;
  }
};
const cell = (v: bigint): string => (v === 0n ? '' : formatMnt(v, { symbol: false }));

export interface AccountRegisterReportProps {
  title: string;
  fileBase: string;
  accountLabel: string; // ж: "Худалдааны авлага (1200)"
  partyKind: string; // "Харилцагч" | "Нийлүүлэгч"
  nature: LedgerNature; // 'debit' = авлага, 'credit' = өглөг
  data: AccountRegister;
  /** Шүүлтээр сонгосон тал — зөвхөн түүнийг харуулж, автоматаар задална. */
  partyId?: string;
  /** Мөр задлахад тухайн талын гүйлгээг татна. */
  loadRows: (partyId: string) => Promise<LedgerRow[]>;
}

export function AccountRegisterReport({ title, fileBase, accountLabel, partyKind, nature, data, partyId, loadRows }: AccountRegisterReportProps) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, LedgerRow[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    let out = data.rows;
    if (partyId) out = out.filter((r) => r.partyId === partyId);
    const needle = q.trim().toLowerCase();
    if (needle) {
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.code ?? '').toLowerCase().includes(needle) ||
          (r.regNo ?? '').toLowerCase().includes(needle),
      );
    }
    return out;
  }, [data.rows, q, partyId]);

  async function toggleOpen(id: string, force = false) {
    if (!force && openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!detail[id]) {
      setLoadingId(id);
      try {
        const loaded = await loadRows(id);
        setDetail((d) => ({ ...d, [id]: loaded }));
      } catch {
        setDetail((d) => ({ ...d, [id]: [] }));
      } finally {
        setLoadingId(null);
      }
    }
  }

  // Шүүлт хийсэн тохиолдолд ХАРАГДАЖ буй мөрүүдээс нийт дүнг бодно — хэвлэсэн
  // хүснэгтийн мөрүүд ба нийт дүн үргэлж тохирно.
  const t = useMemo(() => {
    if (!partyId && !q.trim()) return data.totals;
    const s = rows.reduce(
      (a, r) => ({
        openingMnt: a.openingMnt + toB(r.openingMnt),
        debitMnt: a.debitMnt + toB(r.debitMnt),
        creditMnt: a.creditMnt + toB(r.creditMnt),
        closingMnt: a.closingMnt + toB(r.closingMnt),
      }),
      { openingMnt: 0n, debitMnt: 0n, creditMnt: 0n, closingMnt: 0n },
    );
    return { openingMnt: s.openingMnt.toString(), debitMnt: s.debitMnt.toString(), creditMnt: s.creditMnt.toString(), closingMnt: s.closingMnt.toString() };
  }, [data.totals, rows, partyId, q]);

  // Балансын шалгалт: Эхний + Дебет − Кредит = Эцсийн (§12 инвариант)
  const checkOk = toB(t.openingMnt) + toB(t.debitMnt) - toB(t.creditMnt) === toB(t.closingMnt);

  // Шүүлтээр нэг тал сонгосон бол шууд задалж харуулна (нэг талын тооцооны акт).
  useEffect(() => {
    if (partyId) void toggleOpen(partyId, true);
    else setOpenId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, data.from, data.to]);

  const bal = (v: string | bigint) => ledgerBalanceColumns(nature, toB(v));
  const gross = (d: string | bigint, c: string | bigint) => ledgerGrossColumns(nature, toB(d), toB(c));

  async function doExport() {
    setExporting(true);
    try {
      const tg = gross(t.debitMnt, t.creditMnt);
      const to_ = bal(t.openingMnt);
      const tc = bal(t.closingMnt);
      await exportXlsx(`${fileBase}-${data.from}_${data.to}`, [
        {
          name: 'Тооцооны бүртгэл',
          title,
          meta: [data.companyName ?? '', `Данс: ${accountLabel}`, `Хугацаа: ${data.from} — ${data.to}`],
          columns: [
            { header: 'Код', key: 'code', width: 12 },
            { header: partyKind, key: 'name', width: 32 },
            { header: 'Регистр', key: 'regNo', width: 14 },
            { header: 'Эхний Дт', key: 'od', money: true, width: 16 },
            { header: 'Эхний Кт', key: 'oc', money: true, width: 16 },
            { header: 'Гүйлгээ Дт', key: 'gd', money: true, width: 16 },
            { header: 'Гүйлгээ Кт', key: 'gc', money: true, width: 16 },
            { header: 'Эцсийн Дт', key: 'cd', money: true, width: 16 },
            { header: 'Эцсийн Кт', key: 'cc', money: true, width: 16 },
          ],
          rows: rows.map((r) => {
            const o = bal(r.openingMnt), g = gross(r.debitMnt, r.creditMnt), c = bal(r.closingMnt);
            return {
              code: r.code ?? '', name: r.name, regNo: r.regNo ?? '',
              od: o.debit.toString(), oc: o.credit.toString(),
              gd: g.debit.toString(), gc: g.credit.toString(),
              cd: c.debit.toString(), cc: c.credit.toString(),
            };
          }),
          totals: {
            name: 'НИЙТ ДҮН',
            od: to_.debit.toString(), oc: to_.credit.toString(),
            gd: tg.debit.toString(), gc: tg.credit.toString(),
            cd: tc.debit.toString(), cc: tc.credit.toString(),
          },
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  const tOpen = bal(t.openingMnt), tGross = gross(t.debitMnt, t.creditMnt), tClose = bal(t.closingMnt);

  return (
    <PrintableReport
      title={title}
      companyName={data.companyName}
      rangeLabel={`${data.from} — ${data.to} (төгрөгөөр)`}
      metaLines={[`Данс: ${accountLabel}`, `${partyKind}ийн тоо: ${rows.length}`]}
      onExportXlsx={doExport}
      exporting={exporting}
    >
      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <label className="relative block w-64 max-w-full">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${partyKind} хайх…`}
            className="min-h-touch w-full rounded-xl border bg-background py-1.5 pl-9 pr-3 text-sm"
          />
        </label>
        {!checkOk && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            <AlertTriangle size={13} /> Баланс зөрж байна
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th rowSpan={2} className="px-2 py-1.5 text-left align-bottom font-medium">Код</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left align-bottom font-medium">{partyKind}</th>
              <th colSpan={2} className="border-l px-2 py-1.5 text-center font-medium">Эхний үлдэгдэл</th>
              <th colSpan={2} className="border-l px-2 py-1.5 text-center font-medium">Гүйлгээ</th>
              <th colSpan={2} className="border-l px-2 py-1.5 text-center font-medium">Эцсийн үлдэгдэл</th>
            </tr>
            <tr className="border-b text-[11px] text-muted-foreground">
              <th className="border-l px-2 py-1 text-right font-medium">Дебет</th>
              <th className="px-2 py-1 text-right font-medium">Кредит</th>
              <th className="border-l px-2 py-1 text-right font-medium">Дебет</th>
              <th className="px-2 py-1 text-right font-medium">Кредит</th>
              <th className="border-l px-2 py-1 text-right font-medium">Дебет</th>
              <th className="px-2 py-1 text-right font-medium">Кредит</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const o = bal(r.openingMnt), g = gross(r.debitMnt, r.creditMnt), c = bal(r.closingMnt);
              const isOpen = openId === r.partyId;
              const drill = detail[r.partyId];
              return (
                <RegisterRow
                  key={r.partyId}
                  r={r} o={o} g={g} c={c} zebra={i % 2 === 1} isOpen={isOpen}
                  onToggle={() => void toggleOpen(r.partyId)}
                  loading={loadingId === r.partyId}
                  drill={drill}
                  nature={nature}
                />
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-10 text-center text-muted-foreground">
                  {q ? 'Хайлтад тохирох бичлэг алга' : 'Энэ хугацаанд тооцоо алга'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-double font-semibold">
              <td className="px-2 py-2" colSpan={2}>НИЙТ ДҮН</td>
              <td className="border-l px-2 py-2 text-right tabular-nums">{cell(tOpen.debit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{cell(tOpen.credit)}</td>
              <td className="border-l px-2 py-2 text-right tabular-nums">{cell(tGross.debit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{cell(tGross.credit)}</td>
              <td className="border-l px-2 py-2 text-right tabular-nums">{cell(tClose.debit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{cell(tClose.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="no-print mt-2 text-xs text-muted-foreground">
        Мөр дээр <span className="font-medium">2 удаа дарж (double-click)</span> тухайн {partyKind.toLowerCase()}ийн гүйлгээг задална.
      </p>
    </PrintableReport>
  );
}

/** Нэг талын мөр + (задалсан бол) гүйлгээний дэд хүснэгт. `<tr className="contents">` дотор. */
function RegisterRow({
  r, o, g, c, zebra, isOpen, onToggle, loading, drill, nature,
}: {
  r: AccountRegisterRow;
  o: { debit: bigint; credit: bigint };
  g: { debit: bigint; credit: bigint };
  c: { debit: bigint; credit: bigint };
  zebra: boolean;
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  drill: LedgerRow[] | undefined;
  nature: LedgerNature;
}) {
  return (
    <>
      <tr
        onDoubleClick={onToggle}
        title="Гүйлгээ харах (2 удаа дарна)"
        className={`cursor-pointer border-b transition hover:bg-accent/50 ${zebra ? 'bg-muted/25' : ''} ${isOpen ? 'bg-accent/60' : ''}`}
      >
        <td className="px-2 py-1.5 align-top text-muted-foreground">{r.code ?? '—'}</td>
        <td className="px-2 py-1.5">
          <span className="inline-flex items-center gap-1">
            {isOpen ? (
              <ChevronDown size={13} className="no-print shrink-0 text-primary" />
            ) : (
              <ChevronRight size={13} className="no-print shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">{r.name}</span>
            {r.regNo && <span className="text-xs text-muted-foreground">({r.regNo})</span>}
            {r.txnCount > 0 && (
              <span className="no-print rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{r.txnCount}</span>
            )}
          </span>
        </td>
        <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(o.debit)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cell(o.credit)}</td>
        <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(g.debit)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cell(g.credit)}</td>
        <td className="border-l px-2 py-1.5 text-right font-medium tabular-nums">{cell(c.debit)}</td>
        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{cell(c.credit)}</td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/30">
          <td />
          <td colSpan={7} className="px-2 py-2">
            <div className="rounded-lg border bg-card p-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Гүйлгээний задаргаа</div>
              {loading && <div className="py-3 text-center text-xs text-muted-foreground">Ачаалж байна…</div>}
              {!loading && (!drill || drill.length === 0) && (
                <div className="py-3 text-center text-xs text-muted-foreground">Энэ хугацаанд гүйлгээ алга</div>
              )}
              {!loading && drill && drill.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="px-1 py-1 font-medium">Огноо</th>
                      <th className="px-1 py-1 font-medium">Баримт</th>
                      <th className="px-1 py-1 font-medium">Гүйлгээ</th>
                      <th className="px-1 py-1 text-right font-medium">Дебет</th>
                      <th className="px-1 py-1 text-right font-medium">Кредит</th>
                      <th className="px-1 py-1 text-right font-medium">Үлдэгдэл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.map((x) => (
                      <TxnRow key={x.id} x={x} nature={nature} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Гүйлгээний мөр — 2 дахь шатны задаргаа: дээр нь 2 удаа дарж доторх бараа/түлшийг харна.
 * (Өмнө нь энэ нь тусдаа "нэг талын тооцооны дэвтэр" тайлан байсныг энд нэгтгэв.)
 */
function TxnRow({ x, nature }: { x: LedgerRow; nature: LedgerNature }) {
  const [open, setOpen] = useState(false);
  const g = ledgerGrossColumns(nature, toB(x.debitMnt), toB(x.creditMnt));
  const b = ledgerBalanceColumns(nature, toB(x.balanceAfterMnt));
  const sub = [x.methodLabel, x.reason].filter(Boolean).join(' · ');
  const hasItems = x.items.length > 0;
  return (
    <>
      <tr
        className={`border-t ${hasItems ? 'cursor-pointer hover:bg-accent/40' : ''}`}
        onDoubleClick={() => hasItems && setOpen((v) => !v)}
        title={hasItems ? 'Доторх бараа/түлш (2 удаа дарна)' : undefined}
      >
        <td className="whitespace-nowrap px-1 py-1 text-muted-foreground">
          {new Date(x.createdAt).toLocaleDateString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}
        </td>
        <td className="px-1 py-1 text-muted-foreground">{x.ref ?? '—'}</td>
        <td className="px-1 py-1">
          <span className="inline-flex items-center gap-1">
            {hasItems &&
              (open ? (
                <ChevronDown size={11} className="no-print shrink-0 text-primary" />
              ) : (
                <ChevronRight size={11} className="no-print shrink-0 text-muted-foreground" />
              ))}
            {x.typeLabel}
            {sub && <span className="text-muted-foreground"> · {sub}</span>}
          </span>
        </td>
        <td className="px-1 py-1 text-right tabular-nums">{cell(g.debit)}</td>
        <td className="px-1 py-1 text-right tabular-nums">{cell(g.credit)}</td>
        <td className="px-1 py-1 text-right font-medium tabular-nums">{cell(b.debit) || cell(b.credit)}</td>
      </tr>
      {open && hasItems && (
        <tr className="border-t bg-background">
          <td />
          <td colSpan={5} className="px-1 py-1.5">
            <div className="rounded-md border bg-card p-1.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Орсон бараа / түлш
              </div>
              <table className="w-full text-[11px]">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-1 py-0.5 font-medium">Нэр</th>
                    <th className="px-1 py-0.5 text-right font-medium">Тоо хэмжээ</th>
                    <th className="px-1 py-0.5 text-right font-medium">Нэгж үнэ</th>
                    <th className="px-1 py-0.5 text-right font-medium">Дүн</th>
                  </tr>
                </thead>
                <tbody>
                  {x.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-1 py-0.5">
                        <span className="inline-flex items-center gap-1">
                          {it.itemType === 'FUEL' ? (
                            <Fuel size={10} className="text-blue-500" />
                          ) : (
                            <Package size={10} className="text-amber-600" />
                          )}
                          {it.name}
                          {it.sku && <span className="text-muted-foreground">({it.sku})</span>}
                        </span>
                      </td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{it.quantity} {it.unit}</td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{formatMnt(it.unitCostMnt, { symbol: false })}</td>
                      <td className="px-1 py-0.5 text-right font-medium tabular-nums">{formatMnt(it.totalCostMnt, { symbol: false })}</td>
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
