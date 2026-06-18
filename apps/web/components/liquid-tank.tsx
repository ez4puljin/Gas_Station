'use client';

import { useEffect, useState } from 'react';

/**
 * Резервуарын түвшинг **шингэн долгионоор** (liquid wave) харуулна.
 * - Түвшин/багтаамжийг хувиар + бодит ус нэмэгдэж байгаа мэт зөөлөн дүүрнэ (height transition).
 * - Өнгө нь утгаас хамаарч **систем өөрөө** тодорхойлогдоно (аюултай түвшинг DB-ийн `min`-ээр + хувиар).
 */

// 200×20 viewBox — 2 давталт (seamless), translateX(-50%)-аар гүйлгэхэд тасралтгүй.
const WAVE_PATH =
  'M0,10 C16.7,2 33.3,2 50,10 C66.7,18 83.3,18 100,10 C116.7,2 133.3,2 150,10 C166.7,18 183.3,18 200,10 L200,20 L0,20 Z';

interface Band {
  color: string;
  label: string;
}
const BANDS = {
  danger: { color: '#ef4444', label: 'Маш бага' },
  low: { color: '#f59e0b', label: 'Бага' },
  ok: { color: '#3b82f6', label: 'Хэвийн' },
  high: { color: '#10b981', label: 'Хангалттай' },
} satisfies Record<string, Band>;

/** Аюултай түвшинг систем өөрөө бодно: DB-ийн доод хязгаараас доош = улаан, дараа нь хувиар. */
function classify(pct: number, belowMin: boolean): Band {
  if (belowMin || pct < 10) return BANDS.danger;
  if (pct < 25) return BANDS.low;
  if (pct < 55) return BANDS.ok;
  return BANDS.high;
}

export function LiquidTank({
  code,
  grade,
  current,
  capacity,
  min,
}: {
  code: string;
  grade: string;
  current: number;
  capacity: number;
  min: number;
}) {
  const pct = capacity > 0 ? Math.max(0, Math.min(100, (current / capacity) * 100)) : 0;
  const minPct = capacity > 0 ? Math.max(0, Math.min(100, (min / capacity) * 100)) : 0;
  const belowMin = min > 0 && current <= min;
  const band = classify(pct, belowMin);

  // Эхлэхэд browser 0%-ийг зурсны ДАРАА л зорилтот түвшин рүү шилжүүлнэ → height transition
  // бодитоор тоглож ус **дээшилнэ** (нэг rAF хангалтгүй — нэг frame дотор 0→pct үсэрвэл
  // шилжилт алдагдана; double rAF баталгаажуулна). Дата шинэчлэгдэхэд armed=true хэвээр тул
  // хуучин→шинэ түвшин рүү зөөлөн гүйнэ.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="relative h-40 overflow-hidden rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200/70 dark:from-slate-900 dark:to-slate-800">
        {/* Доод хязгаар (min) — аюулын шугам */}
        {minPct > 0 && minPct < 100 && (
          <div
            className="absolute inset-x-0 z-20 border-t border-dashed border-rose-400/70"
            style={{ bottom: `${minPct}%` }}
          >
            <span className="absolute -top-[7px] right-1 rounded bg-rose-500/90 px-1 text-[8px] font-bold leading-tight text-white">
              min
            </span>
          </div>
        )}

        {/* Шингэн — өндөр (түвшин) + өнгө хоёулаа зөөлөн шилжинэ */}
        <div
          className="tank-rise absolute inset-x-0 bottom-0"
          style={{
            height: `${armed ? pct : 0}%`,
            opacity: armed ? 1 : 0,
            color: band.color,
            transition: 'height 1500ms cubic-bezier(0.22,1,0.36,1), opacity 900ms ease, color 700ms ease',
          }}
        >
          <svg
            className="tank-wave tank-wave--back absolute left-0 top-0 h-5 w-[200%]"
            viewBox="0 0 200 20"
            preserveAspectRatio="none"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d={WAVE_PATH} opacity="0.4" />
          </svg>
          <svg
            className="tank-wave tank-wave--front absolute left-0 top-0 h-5 w-[200%]"
            viewBox="0 0 200 20"
            preserveAspectRatio="none"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d={WAVE_PATH} opacity="0.85" />
          </svg>
          {/* Биеийн дүүргэлт (долгионы доор) */}
          <div className="absolute inset-x-0 bottom-0 top-2.5 bg-current" />
          {/* Усны гялбаа */}
          <div className="absolute inset-x-0 top-2.5 h-6 bg-gradient-to-b from-white/25 to-transparent" />
        </div>

        {/* Хувь */}
        <div className="absolute inset-0 z-10 grid place-items-center">
          <div className="rounded-xl bg-slate-900/15 px-3 py-1 backdrop-blur-[2px]">
            <span
              className="text-3xl font-bold tabular-nums text-white"
              style={{ textShadow: '0 1px 5px rgba(15,23,42,0.45)' }}
            >
              {Math.round(pct)}
              <span className="text-lg">%</span>
            </span>
          </div>
        </div>

        {/* Төлөв (динамик өнгө) */}
        <span
          className="absolute left-2 top-2 z-20 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur dark:bg-slate-900/70"
          style={{ color: band.color }}
        >
          {band.label}
        </span>
      </div>

      {/* Мета */}
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground">{code}</div>
          <div className="truncate text-sm font-semibold">{grade}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">
            {current.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">л</span>
          </div>
          <div className="text-[11px] text-muted-foreground">/ {capacity.toLocaleString()} л</div>
        </div>
      </div>
    </div>
  );
}
