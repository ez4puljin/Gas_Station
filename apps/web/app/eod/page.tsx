'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, CheckCircle2, Lock, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type DailyCloseRow, eodApi, type EodStatusDto } from '@/lib/finance-api';
import { posApi, type StationDto } from '@/lib/pos-api';

function ubToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function EodPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [date, setDate] = useState(ubToday());
  const [status, setStatus] = useState<EodStatusDto | null>(null);
  const [closes, setCloses] = useState<DailyCloseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async (sid: string, d: string) => {
    if (!sid) return;
    const [st, list] = await Promise.all([eodApi.status(sid, d), eodApi.list(sid).catch(() => [])]);
    setStatus(st);
    setCloses(list);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    posApi.stations()
      .then((s) => { setStations(s); if (s[0]) setStationId(s[0].id); })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => { if (stationId) void loadStatus(stationId, date).catch(() => undefined); }, [stationId, date, loadStatus]);

  async function close() {
    setBusy(true); setError(null);
    try { await eodApi.close(stationId, date); await loadStatus(stationId, date); setMsg('Өдөр хаагдаж, GL-д бичигдлээ'); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }
  async function reopen(id: string) {
    setBusy(true); setError(null);
    try { await eodApi.reopen(id); await loadStatus(stationId, date); setMsg('Хаалт дахин нээгдлээ'); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;
  const s = status?.summary;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={CalendarCheck} title="Өдрийн хаалт (EOD)" subtitle="Тухайн өдрийн борлуулалтыг Ерөнхий дэвтэрт нэгтгэн бичиж хаах" />

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Салбар</span>
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
            {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Огноо</span>
          <input type="date" value={date} max={ubToday()} onChange={(e) => setDate(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm" /></label>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
        {/* Тухайн өдрийн дүн + хаалт */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          {!s ? <p className="text-sm text-muted-foreground">Сонгоно уу…</p> : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">{date} — өдрийн дүн</h2>
                {status?.closed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-700"><Lock size={14} /> Хаагдсан</span>
                ) : (
                  <button onClick={close} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"><Lock size={16} /> Өдрийг хаах</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Нийт борлуулалт" value={formatMnt(s.grossMnt)} />
                <Stat label="Цэвэр (НӨАТ-гүй)" value={formatMnt(s.netMnt)} />
                <Stat label="НӨАТ" value={formatMnt(s.vatMnt)} />
                <Stat label="Бэлэн цуглуулсан" value={formatMnt(s.collectedMnt)} />
                <Stat label="Зээл (авлага)" value={formatMnt(s.creditMnt)} />
                <Stat label="Буцаалт" value={formatMnt(s.refundsMnt)} cls={BigInt(s.refundsMnt) > 0n ? 'text-destructive' : ''} />
              </div>
              <h3 className="mb-2 mt-5 text-sm font-semibold">Төлбөрийн хэлбэрээр</h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(s.byMethod).filter(([, v]) => BigInt(v) > 0n).map(([m, v]) => (
                    <tr key={m} className="border-b"><td className="py-1">{PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m}</td><td className="py-1 text-right tabular-nums">{formatMnt(v)}</td></tr>
                  ))}
                </tbody>
              </table>
              {status?.closed && status.close?.journalEntryId && (
                <p className="mt-4 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">GL журнал бичигдсэн</span>
                  <button onClick={() => reopen(status.close!.id)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"><RotateCcw size={13} /> Дахин нээх</button>
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Хаалт: Дт касс/банк/авлага = Кт орлого (түлш/бараа) + НӨАТ. (v1: өртөг/нөөц хасалт дараагийн алхамд)</p>
            </>
          )}
        </section>

        {/* Хаалтын түүх */}
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Сүүлийн хаалтууд</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-1 font-medium">Огноо</th><th className="pb-1 text-right font-medium">Борлуулалт</th><th className="pb-1 text-right font-medium">НӨАТ</th></tr></thead>
            <tbody>
              {closes.map((c) => (
                <tr key={c.id} className="border-b"><td className="py-1.5">{new Date(c.businessDate).toLocaleDateString('mn-MN')}</td><td className="py-1.5 text-right tabular-nums">{formatMnt(c.salesGrossMnt)}</td><td className="py-1.5 text-right tabular-nums">{formatMnt(c.vatMnt)}</td></tr>
              ))}
              {closes.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Хаалт алга</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </main>
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
