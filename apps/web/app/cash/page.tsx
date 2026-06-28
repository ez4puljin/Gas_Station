'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, ArrowUpToLine, Banknote, CheckCircle2, Scale, Vault } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { CASH_MOVEMENT_LABEL, type CashMovementType } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import { type CashMovementsDto, cashApi } from '@/lib/finance-api';
import { posApi, type StationDto } from '@/lib/pos-api';

export default function CashPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [data, setData] = useState<CashMovementsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dropAmt, setDropAmt] = useState('');
  const [dropRef, setDropRef] = useState('');
  const [depAmt, setDepAmt] = useState('');
  const [depRef, setDepRef] = useState('');
  const [adjAmt, setAdjAmt] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const reload = useCallback(async (sid: string) => {
    if (!sid) return;
    setData(await cashApi.movements(sid));
  }, []);

  useEffect(() => {
    if (!tokenStore.access) { router.replace('/login'); return; }
    posApi.stations()
      .then((s) => { setStations(s); if (s[0]) setStationId(s[0].id); })
      .catch((e) => { if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login'); else setError('Ачаалахад алдаа'); })
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => { if (stationId) void reload(stationId).catch(() => undefined); }, [stationId, reload]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setError(null);
    try { await fn(); await reload(stationId); setMsg(okMsg); }
    catch (e) { setError(e instanceof ApiException ? e.error.message : 'Алдаа'); } finally { setBusy(false); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={Vault} title="Бэлэн мөнгөний менежмент" subtitle="Касс → Сейф (drop) → Банк (CIT). Бүр Ерөнхий дэвтэрт бичигдэнэ." />

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={15} /> {msg}</p>}

      <label className="mb-5 inline-block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Салбар</span>
        <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch rounded-xl border bg-background px-3 text-sm">
          {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select></label>

      <div className="mb-6 rounded-2xl border bg-gradient-to-br from-indigo-500 to-blue-600 p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 text-sm opacity-90"><Vault size={16} /> Сейф дэх бэлэн мөнгө</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{data ? formatMnt(data.safeBalanceMnt) : '…'}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* DROP */}
        <Card icon={<ArrowDownToLine size={16} className="text-blue-600" />} title="Касс → Сейф (Drop)">
          <input value={dropAmt} onChange={(e) => setDropAmt(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Дүн (₮)" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <input value={dropRef} onChange={(e) => setDropRef(e.target.value)} placeholder="Уут/баримтын дугаар" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <button onClick={() => act(() => cashApi.transfer({ stationId, type: 'DROP', amount: dropAmt, reference: dropRef || undefined }), 'Drop бүртгэгдлээ').then(() => { setDropAmt(''); setDropRef(''); })} disabled={busy || !dropAmt} className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Бүртгэх</button>
        </Card>
        {/* DEPOSIT */}
        <Card icon={<ArrowUpToLine size={16} className="text-emerald-600" />} title="Сейф → Банк (CIT)">
          <input value={depAmt} onChange={(e) => setDepAmt(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Дүн (₮)" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <input value={depRef} onChange={(e) => setDepRef(e.target.value)} placeholder="Гүйлгээ/слипийн дугаар" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <button onClick={() => act(() => cashApi.transfer({ stationId, type: 'DEPOSIT', amount: depAmt, reference: depRef || undefined }), 'Хадгаламж бүртгэгдлээ').then(() => { setDepAmt(''); setDepRef(''); })} disabled={busy || !depAmt} className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Бүртгэх</button>
        </Card>
        {/* ADJUST */}
        <Card icon={<Scale size={16} className="text-amber-600" />} title="Тооллогын засвар">
          <input value={adjAmt} onChange={(e) => setAdjAmt(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" placeholder="+/- дүн" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Шалтгаан" className="mb-2 min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          <button onClick={() => act(() => cashApi.adjust({ stationId, amountMnt: adjAmt, reason: adjReason }), 'Засвар бүртгэгдлээ').then(() => { setAdjAmt(''); setAdjReason(''); })} disabled={busy || !adjAmt || adjReason.length < 3} className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">Бүртгэх</button>
        </Card>
      </div>

      <section className="mt-6 rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Banknote size={16} className="text-muted-foreground" /> Хөдөлгөөний түүх</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Огноо</th><th className="pb-2 font-medium">Төрөл</th><th className="pb-2 font-medium">Баримт</th><th className="pb-2 text-right font-medium">Дүн</th></tr></thead>
          <tbody>
            {data?.items.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="py-2 text-muted-foreground">{new Date(m.createdAt).toLocaleString('mn-MN')}</td>
                <td className="py-2">{CASH_MOVEMENT_LABEL[m.type as CashMovementType]}</td>
                <td className="py-2 text-muted-foreground">{m.reference ?? m.note ?? '—'}</td>
                <td className={`py-2 text-right font-medium tabular-nums ${m.type === 'DEPOSIT' || (m.type === 'ADJUSTMENT' && BigInt(m.amountMnt) < 0n) ? 'text-destructive' : 'text-emerald-600'}`}>{formatMnt(m.amountMnt)}</td>
              </tr>
            ))}
            {(!data || data.items.length === 0) && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Хөдөлгөөн алга</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">{icon} {title}</h3>
      {children}
    </div>
  );
}
