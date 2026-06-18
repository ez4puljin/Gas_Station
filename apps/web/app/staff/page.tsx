'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, Clock, Droplets, Hourglass, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PAYMENT_METHOD_LABEL, type PaymentMethod, ROLE_LABEL, type RoleKey, SHIFT_STATUS_LABEL, type ShiftStatus } from '@fuel/types';
import { apiFetch, ApiException, tokenStore } from '@/lib/api';
import { posApi, type StationDto } from '@/lib/pos-api';
import { controlApi, type ShiftFull, type TankLite } from '@/lib/control-api';
import { fileToDataUrl } from '@/lib/image';

interface StaffEmp {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  roles: { role: { key: string; name: string } }[];
}
type ReadingMap = Record<string, { cm: string; liters: string; imageUrl: string }>;
const DECLARE_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'MOBILE', 'FUEL_CARD', 'CREDIT'];
const num = (s: string) => s.replace(/[^\d.]/g, '');
const digits = (s: string) => s.replace(/[^\d]/g, '');

export default function StaffPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [shift, setShift] = useState<ShiftFull | null>(null);
  const [tanks, setTanks] = useState<TankLite[]>([]);
  const [employees, setEmployees] = useState<StaffEmp[] | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [tenders, setTenders] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<ReadingMap>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    posApi
      .stations()
      .then((list) => {
        setStations(list);
        if (list.length > 0) setStationId(list[0]!.id);
        setReady(true);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Салбар ачаалахад алдаа гарлаа');
        setReady(true);
      });
  }, [router]);

  const loadStation = useCallback(async (sid: string) => {
    setError(null);
    setReadings({});
    setTenders({});
    setCountedCash('');
    try {
      const [sh, tk] = await Promise.all([controlApi.current(sid), controlApi.tanks(sid)]);
      setShift(sh);
      setTanks(tk);
    } catch {
      setShift(null);
      setTanks([]);
    }
    try {
      setEmployees(await apiFetch<StaffEmp[]>('/staff/employees'));
    } catch {
      setEmployees(null);
    }
  }, []);

  useEffect(() => {
    if (stationId) void loadStation(stationId);
  }, [stationId, loadStation]);

  function setReading(tankId: string, patch: Partial<{ cm: string; liters: string; imageUrl: string }>) {
    setReadings((r) => ({ ...r, [tankId]: { cm: '', liters: '', imageUrl: '', ...r[tankId], ...patch } }));
  }
  async function onPhoto(tankId: string, file?: File) {
    if (!file) return;
    try {
      setReading(tankId, { imageUrl: await fileToDataUrl(file) });
    } catch {
      setError('Зураг боловсруулахад алдаа гарлаа');
    }
  }
  function buildReadings() {
    return tanks
      .filter((t) => readings[t.id]?.cm)
      .map((t) => ({
        tankId: t.id,
        centimeters: readings[t.id]!.cm,
        liters: readings[t.id]!.liters || undefined,
        imageUrl: readings[t.id]!.imageUrl || undefined,
      }));
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      await loadStation(stationId);
      setMsg(ok);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }
  function submitOpen() {
    const tankReadings = buildReadings();
    if (tanks.length > 0 && tankReadings.length < tanks.length) {
      setError('Сав бүрийн түлшний хэмжээ (см) бөглөнө үү');
      return;
    }
    void run(
      () => controlApi.requestOpen({ stationId, openingCashMnt: digits(openingCash) || '0', tankReadings }),
      'Ээлж эхлүүлэх хүсэлт илгээгдлээ — нягтлан/админ батлахыг хүлээнэ',
    );
  }
  function submitClose() {
    if (!shift) return;
    const tankReadings = buildReadings();
    if (tanks.length > 0 && tankReadings.length < tanks.length) {
      setError('Сав бүрийн түлшний хэмжээ (см) бөглөнө үү');
      return;
    }
    const tenderList = DECLARE_METHODS.filter((m) => tenders[m]).map((m) => ({ method: m, declaredMnt: digits(tenders[m]!) }));
    void run(
      () => controlApi.requestClose(shift.id, { countedCashMnt: digits(countedCash) || '0', tankReadings, tenders: tenderList }),
      'Ээлж хаах хүсэлт илгээгдлээ — нягтлан/админ батлахыг хүлээнэ',
    );
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  const status = (shift?.status ?? null) as ShiftStatus | null;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <PageHeader icon={Clock} title="Ажилтан / Ээлж" subtitle="Ээлж хүлээх/хаах хүсэлт — савны хэмжээ + тушаалт">
        <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-h-touch rounded-xl border bg-card px-3 text-sm shadow-sm">
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
          ))}
        </select>
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/* Зүүн: ээлжийн төлөв + нээх/хаах хүсэлт */}
        <div className="space-y-4 lg:col-span-2">
      {/* Төлөв */}
      {status && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'OPEN' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
            ● {SHIFT_STATUS_LABEL[status]}
          </span>
          {shift?.cashiers[0] && (
            <span className="text-sm text-muted-foreground">
              Ажилтан: {shift.cashiers[0].employee.firstName} {shift.cashiers[0].employee.lastName}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{shift && new Date(shift.openedAt).toLocaleString('mn-MN')}</span>
        </div>
      )}

      {/* ── PENDING: хүлээгдэж байна ── */}
      {(status === 'PENDING_OPEN' || status === 'PENDING_CLOSE') && (
        <section className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
            <Hourglass size={22} />
          </div>
          <h2 className="font-semibold">{status === 'PENDING_OPEN' ? 'Нээлтийн хүсэлт илгээгдсэн' : 'Хаалтын хүсэлт илгээгдсэн'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Нягтлан эсвэл админ батлахыг хүлээж байна.</p>
          {shift && shift.tankReadings.length > 0 && (
            <div className="mx-auto mt-4 max-w-md text-left text-sm">
              <p className="mb-1 font-medium">Илгээсэн савны хэмжээ:</p>
              <ul className="space-y-1">
                {shift.tankReadings.filter((r) => r.phase === (status === 'PENDING_OPEN' ? 'OPEN' : 'CLOSE')).map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-lg border bg-background px-2 py-1">
                    <span className="font-mono text-xs">{r.fuelTank.code}</span>
                    <span>{r.centimeters} см {r.imageUrl ? '· 📷' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Ээлж байхгүй: эхлүүлэх хүсэлт ── */}
      {!shift && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Ээлж эхлүүлэх хүсэлт</h2>
          <p className="text-sm text-muted-foreground">Идэвхтэй ээлж алга. Савны түлшний хэмжээг хэмжиж хүсэлт илгээнэ үү.</p>
          <Field label="Эхлэх бэлэн мөнгө (₮)">
            <input value={openingCash} onChange={(e) => setOpeningCash(digits(e.target.value))} inputMode="numeric" className="min-h-touch w-48 rounded-xl border bg-background px-3 text-sm" />
          </Field>
          <TankReadings tanks={tanks} readings={readings} setReading={setReading} onPhoto={onPhoto} />
          <button onClick={submitOpen} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
            <CheckCircle2 size={16} /> Хүсэлт илгээх
          </button>
        </section>
      )}

      {/* ── OPEN: хаах хүсэлт ── */}
      {status === 'OPEN' && shift && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Ээлж хаах хүсэлт</h2>
          <Field label="Тоолсон бэлэн мөнгө (₮)">
            <input value={countedCash} onChange={(e) => setCountedCash(digits(e.target.value))} inputMode="numeric" placeholder="0" className="min-h-touch w-48 rounded-xl border bg-background px-3 text-sm" />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium">Төлбөрийн хэлбэрээр тушаалт (₮)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DECLARE_METHODS.map((m) => (
                <div key={m}>
                  <label className="mb-1 block text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[m]}</label>
                  <input value={tenders[m] ?? ''} onChange={(e) => setTenders((t) => ({ ...t, [m]: digits(e.target.value) }))} inputMode="numeric" placeholder="0" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
                </div>
              ))}
            </div>
          </div>
          <TankReadings tanks={tanks} readings={readings} setReading={setReading} onPhoto={onPhoto} />
          <button onClick={submitClose} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
            <CheckCircle2 size={16} /> Хаах хүсэлт илгээх
          </button>
        </section>
      )}
        </div>

        {/* Баруун: ажилтны жагсаалт */}
        <div className="lg:col-span-1">
      {/* Ажилтан (унших) */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><Users size={18} className="text-muted-foreground" /> Ажилтан</h2>
          <span className="text-xs text-muted-foreground">Засварыг «Админ» цэснээс</span>
        </div>
        {employees === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Ажилтны жагсаалт хандах эрхгүй</p>
        ) : employees.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Ажилтан алга</p>
        ) : (
          <ul className="divide-y text-sm">
            {employees.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{e.lastName} {e.firstName}</span>
                <span className="flex items-center gap-2">
                  {[...new Set(e.roles.map((r) => r.role.key))].map((k) => (
                    <span key={k} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABEL[k as RoleKey] ?? k}</span>
                  ))}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${e.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {e.status === 'ACTIVE' ? 'Идэвхтэй' : 'Идэвхгүй'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function TankReadings({
  tanks,
  readings,
  setReading,
  onPhoto,
}: {
  tanks: TankLite[];
  readings: ReadingMap;
  setReading: (id: string, p: Partial<{ cm: string; liters: string; imageUrl: string }>) => void;
  onPhoto: (id: string, f?: File) => void;
}) {
  if (tanks.length === 0) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <Droplets size={15} className="text-muted-foreground" /> Савны түлшний хэмжээ (шугаман төмрөөр см)
      </p>
      <div className="space-y-2">
        {tanks.map((t) => {
          const r = readings[t.id];
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2">
              <span className="w-28 shrink-0 font-mono text-xs">{t.code}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t.fuelGrade.name}</span>
              <input
                value={r?.cm ?? ''}
                onChange={(e) => setReading(t.id, { cm: num(e.target.value) })}
                inputMode="decimal"
                placeholder="см"
                className="min-h-touch w-20 rounded-lg border bg-card px-2 text-sm"
              />
              <input
                value={r?.liters ?? ''}
                onChange={(e) => setReading(t.id, { liters: num(e.target.value) })}
                inputMode="decimal"
                placeholder="литр (заавал биш)"
                className="min-h-touch w-32 rounded-lg border bg-card px-2 text-sm"
              />
              <label className={`min-h-touch inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs font-medium ${r?.imageUrl ? 'bg-emerald-500/15 text-emerald-700' : 'bg-card'}`}>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(t.id, e.target.files?.[0])} />
                <Camera size={14} /> {r?.imageUrl ? 'Зураг ✓' : 'Зураг'}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
