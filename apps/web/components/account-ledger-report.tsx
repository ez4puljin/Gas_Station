'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Fuel, Package } from 'lucide-react';
import { formatMnt, ledgerBalanceColumns, ledgerGrossColumns } from '@fuel/schemas';
import { PrintableReport } from '@/components/printable-report';
import { exportXlsx } from '@/lib/export-xlsx';

/** Гүйлгээ дотор орсон бараа/түлш (double-click drill-down). */
export interface LedgerGoodsItem {
  itemType: 'FUEL' | 'PRODUCT';
  name: string;
  sku: string | null;
  quantity: string;
  unit: string;
  unitCostMnt: string;
  totalCostMnt: string;
}

/** Тооцооны дэвтрийн нэг гүйлгээ (raw дебет/кредит — amount тэмдгээр). */
export interface LedgerRow {
  id: string;
  createdAt: string;
  typeLabel: string;
  ref: string | null; // баримтын дугаар (борлуулалт/худалдан авалт)
  reason: string | null;
  methodLabel: string | null;
  debitMnt: string; // amount > 0 (raw)
  creditMnt: string; // |amount < 0| (raw)
  balanceAfterMnt: string; // тэмдэгтэй running үлдэгдэл
  items: LedgerGoodsItem[];
}

export interface AccountLedgerReportProps {
  title: string;
  fileBase: string;
  companyName: string | null;
  from: string;
  to: string;
  accountLabel: string; // ж: "Борлуулалтын авлага" / "Нийлүүлэгчийн өглөг"
  partyKind: string; // "Харилцагч" | "Нийлүүлэгч"
  party: { code?: string | null; name: string; regNo: string | null; phone: string | null };
  /** Дансны мөн чанар: авлага = дебет талын, өглөг = кредит талын. */
  nature: 'debit' | 'credit';
  openingMnt: string;
  totalDebitMnt: string; // raw нийт (amount>0)
  totalCreditMnt: string; // raw нийт (|amount<0|)
  closingMnt: string;
  rows: LedgerRow[];
}

const toB = (s: string): bigint => {
  try {
    return BigInt(s || '0');
  } catch {
    return 0n;
  }
};
const cell = (v: bigint): string => (v === 0n ? '' : formatMnt(v, { symbol: false }));

// Логик нь @fuel/schemas (ledger.ts)-д төвлөрсөн + тестлэгдсэн; энд `{d,c}` хэлбэрт буулгана.
function grossCols(nature: 'debit' | 'credit', debit: bigint, credit: bigint): { d: bigint; c: bigint } {
  const r = ledgerGrossColumns(nature, debit, credit);
  return { d: r.debit, c: r.credit };
}
function balCols(nature: 'debit' | 'credit', bal: bigint): { d: bigint; c: bigint } {
  const r = ledgerBalanceColumns(nature, bal);
  return { d: r.debit, c: r.credit };
}

export function AccountLedgerReport(props: AccountLedgerReportProps) {
  const { nature, rows } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const opening = balCols(nature, toB(props.openingMnt));
  const gross = grossCols(nature, toB(props.totalDebitMnt), toB(props.totalCreditMnt));
  const closing = balCols(nature, toB(props.closingMnt));

  async function doExport() {
    setExporting(true);
    try {
      const dataRows = [
        {
          date: '',
          ref: '',
          type: 'Эхний үлдэгдэл',
          debit: opening.d.toString(),
          credit: opening.c.toString(),
          balance: props.openingMnt,
        },
        ...rows.map((r) => {
          const g = grossCols(nature, toB(r.debitMnt), toB(r.creditMnt));
          return {
            date: new Date(r.createdAt).toLocaleString('mn-MN'),
            ref: r.ref ?? '',
            type: r.typeLabel + (r.methodLabel ? ` (${r.methodLabel})` : '') + (r.reason ? ` — ${r.reason}` : ''),
            debit: g.d.toString(),
            credit: g.c.toString(),
            balance: r.balanceAfterMnt,
          };
        }),
      ];
      await exportXlsx(`${props.fileBase}-${props.from}_${props.to}`, [
        {
          name: 'Тооцоо',
          title: props.title,
          meta: [
            props.companyName ?? '',
            `${props.partyKind}: ${props.party.name}${props.party.regNo ? ` (${props.party.regNo})` : ''}`,
            `Данс: ${props.accountLabel}`,
            `Хугацаа: ${props.from} — ${props.to}`,
          ],
          columns: [
            { header: 'Огноо', key: 'date', width: 20 },
            { header: 'Баримт', key: 'ref', width: 18 },
            { header: 'Гүйлгээ', key: 'type', width: 30 },
            { header: 'Дебет', key: 'debit', money: true, width: 16 },
            { header: 'Кредит', key: 'credit', money: true, width: 16 },
            { header: 'Үлдэгдэл', key: 'balance', money: true, width: 18 },
          ],
          rows: dataRows,
          totals: { type: 'НИЙТ ДҮН', debit: gross.d.toString(), credit: gross.c.toString(), balance: props.closingMnt },
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PrintableReport
      title={props.title}
      companyName={props.companyName}
      rangeLabel={`${props.from} — ${props.to} (төгрөгөөр)`}
      metaLines={[
        `Шүүлтийн нөхцөл: ${props.partyKind}: ${props.party.name}${props.party.regNo ? ` (${props.party.regNo})` : ''}${props.party.phone ? ` · ${props.party.phone}` : ''}`,
        `Данс: ${props.accountLabel}`,
      ]}
      onExportXlsx={doExport}
      exporting={exporting}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th rowSpan={2} className="px-2 py-1 text-left align-bottom font-medium">Код / Баримт</th>
            <th rowSpan={2} className="px-2 py-1 text-left align-bottom font-medium">Нэр / Гүйлгээ</th>
            <th colSpan={2} className="border-l px-2 py-1 text-center font-medium">Эхний үлдэгдэл</th>
            <th colSpan={2} className="border-l px-2 py-1 text-center font-medium">Гүйлгээ</th>
            <th colSpan={2} className="border-l px-2 py-1 text-center font-medium">Эцсийн үлдэгдэл</th>
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
          {/* Дансны нийт мөр */}
          <tr className="border-b bg-muted/50 font-semibold">
            <td className="px-2 py-1.5">—</td>
            <td className="px-2 py-1.5">{props.accountLabel}</td>
            <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(opening.d)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{cell(opening.c)}</td>
            <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(gross.d)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{cell(gross.c)}</td>
            <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(closing.d)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{cell(closing.c)}</td>
          </tr>
          {/* Харилцагч/нийлүүлэгчийн мөр */}
          <tr className="border-b font-medium">
            <td className="px-2 py-1.5">{props.party.code ?? '—'}</td>
            <td className="px-2 py-1.5">{props.party.name}</td>
            <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(opening.d)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{cell(opening.c)}</td>
            <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(gross.d)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{cell(gross.c)}</td>
            <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(closing.d)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{cell(closing.c)}</td>
          </tr>
          {/* Гүйлгээнүүд */}
          {rows.map((r) => {
            const g = grossCols(nature, toB(r.debitMnt), toB(r.creditMnt));
            const bal = balCols(nature, toB(r.balanceAfterMnt));
            const hasItems = r.items.length > 0;
            const isOpen = expanded.has(r.id);
            return (
              <FragmentRow
                key={r.id}
                r={r}
                g={g}
                bal={bal}
                hasItems={hasItems}
                isOpen={isOpen}
                onToggle={() => hasItems && toggle(r.id)}
              />
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">
                Энэ хугацаанд гүйлгээ алга
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="px-2 py-2" colSpan={2}>НИЙТ ДҮН</td>
            <td className="border-l px-2 py-2 text-right tabular-nums">{cell(opening.d)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{cell(opening.c)}</td>
            <td className="border-l px-2 py-2 text-right tabular-nums">{cell(gross.d)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{cell(gross.c)}</td>
            <td className="border-l px-2 py-2 text-right tabular-nums">{cell(closing.d)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{cell(closing.c)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="no-print mt-2 text-xs text-muted-foreground">
        Зөвлөмж: бараа орсон гүйлгээ дээр <span className="font-medium">2 удаа дарж (double-click)</span> доторх бараа/түлшийг харна.
      </p>
    </PrintableReport>
  );
}

/** Нэг гүйлгээний мөр + (нээгдсэн бол) доторх барааны дэд хүснэгт. */
function FragmentRow({
  r,
  g,
  bal,
  hasItems,
  isOpen,
  onToggle,
}: {
  r: LedgerRow;
  g: { d: bigint; c: bigint };
  bal: { d: bigint; c: bigint };
  hasItems: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const sub = [r.methodLabel, r.reason].filter(Boolean).join(' · ');
  return (
    <>
      <tr
        onDoubleClick={onToggle}
        className={`border-b ${hasItems ? 'cursor-pointer hover:bg-accent/50' : ''}`}
        title={hasItems ? 'Бараа харах (2 удаа дарна)' : undefined}
      >
        <td className="px-2 py-1.5 align-top text-muted-foreground">{r.ref ?? '—'}</td>
        <td className="px-2 py-1.5">
          <span className="inline-flex items-center gap-1">
            {hasItems &&
              (isOpen ? (
                <ChevronDown size={13} className="no-print shrink-0 text-primary" />
              ) : (
                <ChevronRight size={13} className="no-print shrink-0 text-muted-foreground" />
              ))}
            <span>
              {r.typeLabel}
              {sub && <span className="text-muted-foreground"> : {sub}</span>}
            </span>
          </span>
        </td>
        <td className="border-l px-2 py-1.5 text-right tabular-nums" />
        <td className="px-2 py-1.5 text-right tabular-nums" />
        <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(g.d)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cell(g.c)}</td>
        <td className="border-l px-2 py-1.5 text-right tabular-nums">{cell(bal.d)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cell(bal.c)}</td>
      </tr>
      {isOpen && hasItems && (
        <tr className="border-b bg-muted/30">
          <td />
          <td colSpan={7} className="px-2 py-2">
            <div className="rounded-lg border bg-card p-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Орсон бараа / түлш
              </div>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-1 py-1 font-medium">Нэр</th>
                    <th className="px-1 py-1 text-right font-medium">Тоо хэмжээ</th>
                    <th className="px-1 py-1 text-right font-medium">Нэгж үнэ</th>
                    <th className="px-1 py-1 text-right font-medium">Дүн</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-1 py-1">
                        <span className="inline-flex items-center gap-1.5">
                          {it.itemType === 'FUEL' ? (
                            <Fuel size={12} className="text-blue-500" />
                          ) : (
                            <Package size={12} className="text-amber-600" />
                          )}
                          {it.name}
                          {it.sku && <span className="text-muted-foreground">({it.sku})</span>}
                        </span>
                      </td>
                      <td className="px-1 py-1 text-right tabular-nums">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-1 py-1 text-right tabular-nums">{formatMnt(it.unitCostMnt, { symbol: false })}</td>
                      <td className="px-1 py-1 text-right font-medium tabular-nums">{formatMnt(it.totalCostMnt, { symbol: false })}</td>
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
