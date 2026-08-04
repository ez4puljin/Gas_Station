'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CalendarRange, RotateCcw } from 'lucide-react';
import { customersApi } from '@/lib/customers-api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { procurementApi } from '@/lib/procurement-api';

/**
 * Тайлангийн НЭГДСЭН шүүлтүүрийн мөр — бүх тайланд ижил байрлал/дараалал/хэлбэр.
 * Огнооны муж (+товч сонголт) · салбар · харилцагч · нийлүүлэгч — хэрэгтэйг нь асаана.
 */

export interface ReportRange {
  from: string;
  to: string;
}

function ub(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000);
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Түгээмэл мужууд — нягтлан ихэвчлэн эдгээрийг сонгодог. */
export const RANGE_PRESETS: { label: string; get: () => ReportRange }[] = [
  { label: 'Өнөөдөр', get: () => ({ from: ymd(ub()), to: ymd(ub()) }) },
  {
    label: 'Энэ сар',
    get: () => {
      const n = ub();
      return { from: `${n.toISOString().slice(0, 7)}-01`, to: ymd(n) };
    },
  },
  {
    label: 'Өнгөрсөн сар',
    get: () => {
      const n = ub();
      const first = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0));
      return { from: ymd(first), to: ymd(last) };
    },
  },
  {
    label: 'Энэ улирал',
    get: () => {
      const n = ub();
      const q = Math.floor(n.getUTCMonth() / 3) * 3;
      return { from: ymd(new Date(Date.UTC(n.getUTCFullYear(), q, 1))), to: ymd(n) };
    },
  },
  {
    label: 'Энэ жил',
    get: () => {
      const n = ub();
      return { from: `${n.getUTCFullYear()}-01-01`, to: ymd(n) };
    },
  },
];

/** Анхны муж — энэ сар. */
export function defaultRange(): ReportRange {
  return RANGE_PRESETS[1]!.get();
}

interface PartyOption {
  id: string;
  name: string;
  code?: string | null;
}

export function ReportFilters({
  range,
  onRange,
  stationId,
  onStation,
  customerId,
  onCustomer,
  supplierId,
  onSupplier,
  dateLabel = 'Хугацаа',
  singleDate = false,
  children,
}: {
  range: ReportRange;
  onRange: (r: ReportRange) => void;
  stationId?: string;
  onStation?: (v: string) => void;
  customerId?: string;
  onCustomer?: (v: string) => void;
  supplierId?: string;
  onSupplier?: (v: string) => void;
  dateLabel?: string;
  /** Зөвхөн нэг огноо (тайлан тухайн өдрийн БАЙДЛААР бол). */
  singleDate?: boolean;
  children?: ReactNode;
}) {
  const [stations, setStations] = useState<StationDto[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);

  useEffect(() => {
    if (onStation) void posApi.stations().then(setStations).catch(() => undefined);
    if (onCustomer) void customersApi.list().then((c) => setCustomers(c)).catch(() => undefined);
    if (onSupplier) void procurementApi.suppliers().then((s) => setSuppliers(s)).catch(() => undefined);
    // Сонголтуудыг нэг л удаа татна (шүүлт солигдоход дахин татахгүй).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activePreset = RANGE_PRESETS.find((p) => {
    const r = p.get();
    return r.from === range.from && r.to === range.to;
  })?.label;

  return (
    <section className="no-print mb-5 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarRange size={13} /> {dateLabel}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={range.from}
              onChange={(e) => onRange({ ...range, from: e.target.value, ...(singleDate ? { to: e.target.value } : {}) })}
              className="min-h-touch rounded-xl border bg-background px-3 text-sm"
            />
            {!singleDate && (
              <>
                <span className="text-muted-foreground">—</span>
                <input
                  type="date"
                  value={range.to}
                  min={range.from}
                  onChange={(e) => onRange({ ...range, to: e.target.value })}
                  className="min-h-touch rounded-xl border bg-background px-3 text-sm"
                />
              </>
            )}
          </div>
        </div>

        {onStation && (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Салбар</span>
            <select value={stationId ?? ''} onChange={(e) => onStation(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
              <option value="">Бүх салбар</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
              ))}
            </select>
          </label>
        )}

        {onCustomer && (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Харилцагч</span>
            <select value={customerId ?? ''} onChange={(e) => onCustomer(e.target.value)} className="min-h-touch max-w-[15rem] rounded-xl border bg-background px-3 text-sm">
              <option value="">Бүх харилцагч</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {onSupplier && (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Нийлүүлэгч</span>
            <select value={supplierId ?? ''} onChange={(e) => onSupplier(e.target.value)} className="min-h-touch max-w-[15rem] rounded-xl border bg-background px-3 text-sm">
              <option value="">Бүх нийлүүлэгч</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}

        {children}
      </div>

      {!singleDate && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onRange(p.get())}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                activePreset === p.label ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {p.label}
            </button>
          ))}
          {(customerId || supplierId || stationId) && (
            <button
              onClick={() => { onStation?.(''); onCustomer?.(''); onSupplier?.(''); }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent"
            >
              <RotateCcw size={12} /> Шүүлт цэвэрлэх
            </button>
          )}
        </div>
      )}
    </section>
  );
}
