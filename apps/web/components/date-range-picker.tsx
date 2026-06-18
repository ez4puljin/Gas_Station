'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

// Монгол хэлтэй календар (native <input type=date>-ийн попап браузерын локалаар гардаг тул гараар).
const MONTHS = [
  '1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар',
  '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар',
];
const WEEKDAYS = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня']; // Даваагаар эхэлнэ

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`; // m: 0-11
function parse(s: string): { y: number; m: number; d: number } {
  const p = s.split('-');
  return { y: Number(p[0]), m: Number(p[1]) - 1, d: Number(p[2]) }; // m: 0-11
}
function display(s: string) {
  const { y, m, d } = parse(s);
  return `${y}.${pad(m + 1)}.${pad(d)}`;
}
/** TZ-аас хамааралгүй (UTC дээр) хоног нэмэх/хасах. */
function addDays(s: string, n: number) {
  const { y, m, d } = parse(s);
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

export function DateRangePicker({
  value,
  today,
  onChange,
}: {
  value: DateRange;
  today: string;
  onChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const init = parse(value.from || today);
  const [viewY, setViewY] = useState(init.y);
  const [viewM, setViewM] = useState(init.m);
  const [anchor, setAnchor] = useState<string | null>(null); // муж сонгож эхэлсэн өдөр
  const ref = useRef<HTMLDivElement>(null);

  // Нээгдэх бүрд харагдах сарыг value.from дээр тааруулж, гадна дарахад хаах.
  useEffect(() => {
    if (!open) return;
    const b = parse(value.from || today);
    setViewY(b.y);
    setViewM(b.m);
    setAnchor(null);
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cells = useMemo(() => {
    const firstDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7; // Даваа = 0
    const days = new Date(viewY, viewM + 1, 0).getDate();
    const arr: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewY, viewM]);

  function pick(d: number) {
    const s = iso(viewY, viewM, d);
    if (!anchor) {
      setAnchor(s);
      onChange({ from: s, to: s });
    } else {
      let from = anchor;
      let to = s;
      if (to < from) [from, to] = [to, from];
      onChange({ from, to });
      setAnchor(null);
      setOpen(false);
    }
  }
  function preset(from: string, to: string) {
    onChange({ from, to });
    setOpen(false);
  }
  function prevMonth() {
    if (viewM === 0) { setViewY(viewY - 1); setViewM(11); } else setViewM(viewM - 1);
  }
  function nextMonth() {
    if (viewM === 11) { setViewY(viewY + 1); setViewM(0); } else setViewM(viewM + 1);
  }

  const label = value.from === value.to ? display(value.from) : `${display(value.from)} – ${display(value.to)}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-touch items-center gap-2 rounded-xl border bg-card px-3 text-sm shadow-sm transition hover:bg-accent"
      >
        <CalendarDays size={15} className="text-muted-foreground" />
        <span className="tabular-nums">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[300px] rounded-2xl border border-border bg-card p-3 shadow-xl">
          {/* Сар сэлгэх */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Өмнөх сар">
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold">{viewY} оны {MONTHS[viewM]}</div>
            <button type="button" onClick={nextMonth} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Дараагийн сар">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Гарагийн толгой */}
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>

          {/* Өдрүүд */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const s = iso(viewY, viewM, d);
              const selected = s === value.from || s === value.to;
              const inRange = value.from !== value.to && s > value.from && s < value.to;
              const isToday = s === today;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => pick(d)}
                  className={`h-9 rounded-lg text-sm tabular-nums transition ${
                    selected
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : inRange
                        ? 'bg-primary/15 text-foreground'
                        : 'hover:bg-accent'
                  } ${isToday && !selected ? 'ring-1 ring-inset ring-primary/50' : ''}`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Хурдан сонголт */}
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
            <Preset label="Өнөөдөр" onClick={() => preset(today, today)} />
            <Preset label="7 хоног" onClick={() => preset(addDays(today, -6), today)} />
            <Preset label="30 хоног" onClick={() => preset(addDays(today, -29), today)} />
            <Preset label="Энэ сар" onClick={() => preset(`${today.slice(0, 7)}-01`, today)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium transition hover:bg-accent"
    >
      {label}
    </button>
  );
}
