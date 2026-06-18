'use client';

import type { ReactNode } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';

/**
 * Хэвлэх + Excel татах боломжтой тайлангийн нэгдсэн бүрхүүл (CLAUDE.md §7.4).
 * Дэлгэц дээр toolbar (.no-print) + хэвлэхэд цэвэр гарчиг/гарын үсгийн хэсэг.
 */
export function PrintableReport({
  title,
  companyName,
  rangeLabel,
  metaLines,
  onExportXlsx,
  exporting,
  children,
  footerSignatures = true,
}: {
  title: string;
  companyName?: string | null;
  rangeLabel?: string | null;
  metaLines?: string[];
  onExportXlsx?: () => void | Promise<void>;
  exporting?: boolean;
  children: ReactNode;
  footerSignatures?: boolean;
}) {
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-end gap-2">
        {onExportXlsx && (
          <button
            onClick={() => void onExportXlsx()}
            disabled={exporting}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm transition hover:bg-accent disabled:opacity-50"
          >
            <FileSpreadsheet size={16} className="text-emerald-600" /> {exporting ? 'Бэлдэж байна…' : 'Excel файл'}
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm transition hover:bg-accent"
        >
          <Printer size={16} /> Хэвлэх
        </button>
      </div>

      <div className="print-area rounded-2xl border bg-card p-6 shadow-sm">
        <header className="mb-5 text-center">
          {companyName && <div className="text-sm font-semibold tracking-wide">{companyName}</div>}
          <h2 className="mt-0.5 text-xl font-bold tracking-tight">{title}</h2>
          {rangeLabel && <div className="mt-0.5 text-sm text-muted-foreground">{rangeLabel}</div>}
          {metaLines?.map((m, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              {m}
            </div>
          ))}
        </header>

        {children}

        {footerSignatures && (
          <footer className="mt-10 grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>Тайлан гаргасан: ……………………………… /………………………/</div>
            <div className="sm:text-right">Хянасан нягтлан бодогч: ……………………………… /………………………/</div>
          </footer>
        )}
      </div>
    </div>
  );
}
