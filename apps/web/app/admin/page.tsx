'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  Shield,
  Store,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { ROLE_LABEL, type RoleKey } from '@fuel/types';
import { ApiException, tokenStore } from '@/lib/api';
import {
  type AdminEmployee,
  adminApi,
  type AdminRole,
  type FuelGradeDto,
  type Permission,
  type TankDto,
} from '@/lib/admin-api';
import { posApi, type StationDto } from '@/lib/pos-api';

type Tab = 'stations' | 'employees' | 'roles';
const ROLE_KEYS: RoleKey[] = ['CASHIER', 'SHIFT_SUPERVISOR', 'STATION_MANAGER', 'ACCOUNTANT', 'ADMIN', 'OWNER'];
const TABS: { key: Tab; label: string; icon: typeof Store }[] = [
  { key: 'stations', label: 'Салбар', icon: Store },
  { key: 'employees', label: 'Ажилтан', icon: Users },
  { key: 'roles', label: 'Эрх (Role)', icon: Shield },
];

interface TankForm {
  id: string | null;
  code: string;
  fuelGradeId: string;
  capacityLiters: string;
  currentLiters: string;
  minLiters: string;
}

/** Литр — зөвхөн нэг цэг, ≤3 бутархай (серверийн ^\d+(\.\d{1,3})?$-тэй нийцүүлнэ). */
function sanitizeQty(s: string): string {
  const v = s.replace(/[^\d.]/g, '');
  const dot = v.indexOf('.');
  if (dot === -1) return v;
  const frac = v.slice(dot + 1).replace(/\./g, '').slice(0, 3); // нэмэлт цэгүүдийг устгаж ≤3 орон
  return `${v.slice(0, dot)}.${frac}`;
}
interface EmpForm {
  id: string | null; // null = шинэ, эс бөгөөс засвар
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  stationId: string;
  role: RoleKey;
  username: string;
  password: string;
  isActive: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('stations');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [stations, setStations] = useState<StationDto[]>([]);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [grades, setGrades] = useState<FuelGradeDto[]>([]);

  // Салбар нэмэх
  const [stCode, setStCode] = useState('');
  const [stName, setStName] = useState('');
  const [stAddress, setStAddress] = useState('');
  // Резервуар
  const [openTanksFor, setOpenTanksFor] = useState<string | null>(null);
  const [tanks, setTanks] = useState<TankDto[]>([]);
  // Салбар бүрийн зарагддаг түлшний грейд (мөрөнд харуулах товч мэдээлэл)
  const [gradesByStation, setGradesByStation] = useState<Record<string, string[]>>({});
  const [tankForm, setTankForm] = useState<TankForm | null>(null);
  const [tankStationId, setTankStationId] = useState<string>('');
  // Ажилтан
  const [empForm, setEmpForm] = useState<EmpForm | null>(null);
  const [resetFor, setResetFor] = useState<AdminEmployee | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [empStation, setEmpStation] = useState('ALL');
  const [empActive, setEmpActive] = useState<'all' | 'active' | 'inactive'>('all');

  const reload = useCallback(async () => {
    const [s, e, r, p, g] = await Promise.all([
      posApi.stations(),
      adminApi.employees(),
      adminApi.roles(),
      adminApi.permissions(),
      adminApi.fuelGrades(),
    ]);
    setStations(s);
    setEmployees(e);
    setRoles(r);
    setPerms(p);
    setGrades(g);
    // Салбар бүрийн сав → зарагддаг түлшний төрөл (мөрөнд харуулна). Алдаатайг хоосноор алгасна.
    const tankLists = await Promise.all(
      s.map((st) =>
        adminApi
          .tanks(st.id)
          .then((ts) => [st.id, ts] as const)
          .catch(() => [st.id, [] as TankDto[]] as const),
      ),
    );
    const gmap: Record<string, string[]> = {};
    for (const [sid, ts] of tankLists) {
      gmap[sid] = Array.from(
        new Set(ts.map((t) => t.fuelGrade?.name ?? t.fuelGrade?.code).filter(Boolean) as string[]),
      );
    }
    setGradesByStation(gmap);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((err) => {
        if (err instanceof ApiException && err.error.statusCode === 401) router.replace('/login');
        else if (err instanceof ApiException && err.error.statusCode === 403)
          setError('Зөвхөн админ/эзэмшигч хандах эрхтэй');
        else setError('Ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router, reload]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      await reload();
      // Нээлттэй салбарын савыг шинэчилнэ; тухайн салбар устсан бол catch-аар чимээгүй цэвэрлэнэ
      // (устсан салбарын tanks дуудлага амжилтыг алдаа мэт харуулахаас сэргийлнэ).
      if (openTanksFor) {
        try {
          setTanks(await adminApi.tanks(openTanksFor));
        } catch {
          setOpenTanksFor(null);
          setTanks([]);
        }
      }
      setMsg(ok);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function toggleTanks(stationId: string) {
    if (openTanksFor === stationId) {
      setOpenTanksFor(null);
      return;
    }
    setOpenTanksFor(stationId);
    try {
      setTanks(await adminApi.tanks(stationId));
    } catch {
      setTanks([]);
    }
  }

  function openNewTank(stationId: string) {
    setTankStationId(stationId);
    setTankForm({ id: null, code: '', fuelGradeId: grades[0]?.id ?? '', capacityLiters: '', currentLiters: '', minLiters: '' });
  }
  function openEditTank(stationId: string, t: TankDto) {
    setTankStationId(stationId);
    setTankForm({ id: t.id, code: t.code, fuelGradeId: t.fuelGradeId, capacityLiters: String(t.capacityLiters), currentLiters: String(t.currentLiters), minLiters: String(t.minLiters) });
  }
  async function saveTank() {
    if (!tankForm) return;
    if (!tankForm.code.trim() || !tankForm.fuelGradeId || !tankForm.capacityLiters) {
      setError('Сав код, грейд, багтаамж заавал');
      return;
    }
    const sid = tankStationId;
    await run(async () => {
      if (tankForm.id) {
        await adminApi.updateTank(sid, tankForm.id, {
          code: tankForm.code.trim(),
          fuelGradeId: tankForm.fuelGradeId,
          capacityLiters: tankForm.capacityLiters,
          minLiters: tankForm.minLiters || '0',
        });
      } else {
        await adminApi.createTank(sid, {
          code: tankForm.code.trim(),
          fuelGradeId: tankForm.fuelGradeId,
          capacityLiters: tankForm.capacityLiters,
          currentLiters: tankForm.currentLiters || '0',
          minLiters: tankForm.minLiters || '0',
        });
      }
    }, tankForm.id ? 'Резервуар шинэчлэгдлээ' : 'Резервуар нэмэгдлээ');
    setTankForm(null);
  }

  function openNewEmp() {
    setEmpForm({
      id: null, firstName: '', lastName: '', phone: '', address: '',
      stationId: stations[0]?.id ?? '', role: 'CASHIER', username: '', password: '', isActive: true,
    });
  }
  function openEditEmp(e: AdminEmployee) {
    setEmpForm({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      phone: e.phone ?? '',
      address: e.address ?? '',
      stationId: e.stations[0]?.stationId ?? stations[0]?.id ?? '',
      role: (e.roles[0]?.role.key as RoleKey) ?? 'CASHIER',
      username: e.user?.username ?? '',
      password: '',
      isActive: e.status === 'ACTIVE',
    });
  }
  async function saveEmp() {
    if (!empForm) return;
    const f = empForm;
    if (!f.firstName || !f.lastName || !f.phone || !f.address || !f.stationId) {
      setError('Овог, нэр, утас, хаяг, салбар заавал');
      return;
    }
    if (f.id) {
      // Засвар — нэр/утас/хаяг/төлөв + салбар + эрх (нууц үгийг тусад нь reset-ээр)
      await run(async () => {
        await adminApi.updateEmployee(f.id as string, {
          firstName: f.firstName, lastName: f.lastName, phone: f.phone, address: f.address,
          status: f.isActive ? 'ACTIVE' : 'INACTIVE',
        });
        await adminApi.setStations(f.id as string, [f.stationId]);
        await adminApi.setRoles(f.id as string, [f.role]);
      }, 'Ажилтан шинэчлэгдлээ');
    } else {
      if (!f.username || f.password.length < 8) {
        setError('Нэвтрэх нэр + нууц үг (≥8) заавал');
        return;
      }
      await run(async () => {
        await adminApi.createEmployee({
          firstName: f.firstName, lastName: f.lastName, phone: f.phone, address: f.address,
          stationIds: [f.stationId], roleKeys: [f.role], username: f.username, password: f.password, isActive: f.isActive,
        });
      }, 'Ажилтан нэмэгдлээ');
    }
    setEmpForm(null);
  }
  async function doReset() {
    if (!resetFor || resetPass.length < 8) {
      setError('Нууц үг ≥8 тэмдэгт');
      return;
    }
    await run(() => adminApi.resetPassword(resetFor.id, resetPass), 'Нэвтрэх нууц үг шинэчлэгдлээ');
    setResetFor(null);
    setResetPass('');
  }

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (empActive === 'active' && e.status !== 'ACTIVE') return false;
      if (empActive === 'inactive' && e.status === 'ACTIVE') return false;
      if (empStation !== 'ALL' && !e.stations.some((s) => s.stationId === empStation)) return false;
      if (q) {
        const hay = `${e.lastName} ${e.firstName} ${e.phone ?? ''} ${e.user?.username ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, empSearch, empStation, empActive]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-8">
      <PageHeader
        icon={Shield}
        title="Админ"
        subtitle={`${stations.length} салбар · ${employees.length} ажилтан · ${roles.length} эрх`}
      />

      <div className="mb-5 inline-flex rounded-xl bg-muted p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {error && <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {/* ── САЛБАР + РЕЗЕРВУАР ── */}
      {tab === 'stations' && (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Plus size={16} className="text-primary" /> Шинэ салбар
            </h2>
            <div className="flex flex-wrap gap-2">
              <input value={stCode} onChange={(e) => setStCode(e.target.value)} placeholder="Код (S004)" className="min-h-touch w-28 rounded-xl border bg-background px-3 text-sm" />
              <input value={stName} onChange={(e) => setStName(e.target.value)} placeholder="Нэр" className="min-h-touch w-40 flex-1 rounded-xl border bg-background px-3 text-sm" />
              <input value={stAddress} onChange={(e) => setStAddress(e.target.value)} placeholder="Хаяг" className="min-h-touch w-44 flex-1 rounded-xl border bg-background px-3 text-sm" />
              <button
                disabled={busy || !stCode || !stName}
                onClick={() => run(async () => { await adminApi.createStation({ code: stCode, name: stName, address: stAddress.trim() || undefined }); setStCode(''); setStName(''); setStAddress(''); }, 'Салбар нэмэгдлээ')}
                className="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50"
              >
                <Plus size={16} /> Нэмэх
              </button>
            </div>
          </div>

          {stations.length === 0 ? (
            <EmptyState icon={Store} text="Салбар алга байна" />
          ) : (
            <div className="space-y-3">
              {stations.map((s) => {
                const open = openTanksFor === s.id;
                const empCount = employees.filter((e) => e.stations.some((st) => st.stationId === s.id)).length;
                const sGrades = gradesByStation[s.id] ?? [];
                return (
                  <div key={s.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                    {/* Толгой — мөр дээр дарахад резервуар жагсаалт нээгдэнэ */}
                    <div className="flex items-center gap-3 p-4">
                      <button onClick={() => toggleTanks(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        {open ? <ChevronDown size={18} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={18} className="shrink-0 text-muted-foreground" />}
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 size={18} /></span>
                        <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-x-5 gap-y-2 sm:grid-cols-4">
                          {/* Нэр */}
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Нэр</div>
                            <div className="truncate text-sm font-semibold">{s.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{s.code}</div>
                          </div>
                          {/* Хаяг */}
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Хаяг</div>
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin size={13} className="shrink-0 text-muted-foreground" />
                              <span className="truncate">{s.address || '—'}</span>
                            </div>
                          </div>
                          {/* Ажилтан */}
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ажилтан</div>
                            <div className="flex items-center gap-1 text-sm font-semibold">
                              <Users size={13} className="text-muted-foreground" /> {empCount}
                            </div>
                          </div>
                          {/* Зарагддаг түлш */}
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Түлш</div>
                            {sGrades.length === 0 ? (
                              <div className="text-sm text-muted-foreground">—</div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {sGrades.map((g) => (
                                  <span key={g} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium">{g}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                      <button onClick={() => run(() => adminApi.deleteStation(s.id), 'Салбар устгагдлаа')} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Устгах">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {open && (
                      <div className="border-t bg-muted/20 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Резервуар</h3>
                          <button onClick={() => openNewTank(s.id)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm hover:brightness-105">
                            <Plus size={14} /> Сав нэмэх
                          </button>
                        </div>
                        {tanks.length === 0 ? (
                          <p className="py-4 text-center text-sm text-muted-foreground">Сав алга</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border bg-card">
                            {/* Бүртгэлд зөвхөн тохиргоо (код/грейд/багтаамж/төлөв). Одоогийн түвшин ба
                                доод босго нь операцийн мэдээлэл тул нөөц/тайлан/dashboard-д харагдана. */}
                            <table className="w-full min-w-[480px] text-sm">
                              <colgroup>
                                <col className="w-[34%]" />
                                <col className="w-[22%]" />
                                <col className="w-[20%]" />
                                <col className="w-[14%]" />
                                <col className="w-[10%]" />
                              </colgroup>
                              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2.5 font-medium">Сав</th>
                                  <th className="px-3 py-2.5 font-medium">Грейд</th>
                                  <th className="px-3 py-2.5 text-right font-medium">Багтаамж</th>
                                  <th className="px-3 py-2.5 font-medium">Төлөв</th>
                                  <th className="px-3 py-2.5 text-right font-medium">Үйлдэл</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {tanks.map((t) => (
                                  <tr key={t.id} className="transition hover:bg-accent/30">
                                    <td className="px-3 py-2.5 font-mono text-xs">{t.code}</td>
                                    <td className="px-3 py-2.5">{t.fuelGrade?.name ?? t.fuelGrade?.code}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(t.capacityLiters).toLocaleString()} л</td>
                                    <td className="px-3 py-2.5">
                                      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${t.isActive ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                                        {t.isActive ? 'Идэвхтэй' : 'Идэвхгүй'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <div className="flex justify-end gap-1">
                                        <button onClick={() => openEditTank(s.id, t)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Засах"><Pencil size={14} /></button>
                                        <button onClick={() => run(() => adminApi.deleteTank(s.id, t.id), 'Сав устгагдлаа')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Устгах"><Trash2 size={14} /></button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── АЖИЛТАН ── */}
      {tab === 'employees' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:min-w-64">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Нэр, утас, нэвтрэх нэрээр хайх…" className="min-h-touch w-full rounded-xl border bg-card pl-9 pr-3 text-sm shadow-sm" />
            </div>
            <select value={empStation} onChange={(e) => setEmpStation(e.target.value)} className="min-h-touch rounded-xl border bg-card px-3 text-sm shadow-sm">
              <option value="ALL">Бүх салбар</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
            <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
              {(['all', 'active', 'inactive'] as const).map((a) => (
                <button key={a} onClick={() => setEmpActive(a)} className={`rounded-lg px-3 py-1.5 font-medium transition ${empActive === a ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  {a === 'all' ? 'Бүгд' : a === 'active' ? 'Идэвхтэй' : 'Идэвхгүй'}
                </button>
              ))}
            </div>
            <button onClick={openNewEmp} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105">
              <UserPlus size={16} /> Шинэ ажилтан
            </button>
          </div>

          {filteredEmployees.length === 0 ? (
            <EmptyState icon={Users} text="Ажилтан алга байна" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Нэр</th>
                    <th className="px-4 py-2.5 font-medium">Утас</th>
                    <th className="px-4 py-2.5 font-medium">Хаяг</th>
                    <th className="px-4 py-2.5 font-medium">Салбар</th>
                    <th className="px-4 py-2.5 font-medium">Эрх</th>
                    <th className="px-4 py-2.5 font-medium">Нэвтрэх</th>
                    <th className="px-4 py-2.5 font-medium">Төлөв</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEmployees.map((e) => {
                    const roleKeys = [...new Set(e.roles.map((r) => r.role.key))];
                    return (
                      <tr key={e.id} className="transition hover:bg-accent/40">
                        <td className="px-4 py-2.5 font-medium">{e.lastName} {e.firstName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{e.phone ?? '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{e.address ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {e.stations.length === 0 ? <span className="text-muted-foreground">—</span> : e.stations.map((s) => (
                              <span key={s.stationId} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground" title={s.station.code}>{s.station.name}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {roleKeys.length === 0 ? <span className="text-muted-foreground">—</span> : roleKeys.map((k) => (
                              <span key={k} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABEL[k as RoleKey] ?? k}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {e.user?.username ? <span className="inline-flex items-center gap-1.5"><KeyRound size={13} /> {e.user.username}</span> : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => run(() => adminApi.updateEmployee(e.id, { status: e.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }), 'Төлөв шинэчлэгдлээ')}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
                          >
                            {e.status === 'ACTIVE' ? 'Идэвхтэй' : 'Идэвхгүй'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openEditEmp(e)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Засах" aria-label="Засах"><Pencil size={15} /></button>
                            {e.user?.username && (
                              <button onClick={() => { setResetFor(e); setResetPass(''); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Нууц үг сэргээх" aria-label="Нууц үг сэргээх"><KeyRound size={15} /></button>
                            )}
                            <button onClick={() => run(() => adminApi.deleteEmployee(e.id), 'Ажилтан устгагдлаа')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Устгах"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── ЭРХ ── */}
      {tab === 'roles' && (
        <section className="space-y-3">
          {roles.map((r) => (
            <RoleEditor key={r.id} role={r} perms={perms} busy={busy} onSave={(keys) => run(() => adminApi.setRolePermissions(r.key, keys), `${r.name} эрх хадгалагдлаа`)} />
          ))}
        </section>
      )}

      {/* Резервуар модал */}
      {tankForm && (
        <Modal title={tankForm.id ? 'Резервуар засах' : 'Шинэ резервуар'} onClose={() => setTankForm(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Савны код">
                <input value={tankForm.code} onChange={(e) => setTankForm({ ...tankForm, code: e.target.value })} placeholder="Tank-1" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </FormField>
              <FormField label="Грейд">
                <select value={tankForm.fuelGradeId} onChange={(e) => setTankForm({ ...tankForm, fuelGradeId: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-2 text-sm">
                  <option value="">— сонгох —</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Багтаамж (л)">
                <input value={tankForm.capacityLiters} onChange={(e) => setTankForm({ ...tankForm, capacityLiters: sanitizeQty(e.target.value) })} inputMode="decimal" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </FormField>
              <FormField label="Доод босго (л)">
                <input value={tankForm.minLiters} onChange={(e) => setTankForm({ ...tankForm, minLiters: sanitizeQty(e.target.value) })} inputMode="decimal" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground">
              Одоогийн түвшинг нөөцийн нийлүүлэлт/засвараар бүртгэнэ — тайлан/dashboard-д харагдана (§7.2).
            </p>
          </div>
          <ModalActions onCancel={() => setTankForm(null)} onSave={saveTank} busy={busy} />
        </Modal>
      )}

      {/* Ажилтан нэмэх / засах модал */}
      {empForm && (
        <Modal title={empForm.id ? 'Ажилтан засах' : 'Шинэ ажилтан'} onClose={() => setEmpForm(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Овог"><input value={empForm.lastName} onChange={(e) => setEmpForm({ ...empForm, lastName: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" /></FormField>
              <FormField label="Нэр"><input value={empForm.firstName} onChange={(e) => setEmpForm({ ...empForm, firstName: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Утасны дугаар"><input value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} inputMode="tel" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" /></FormField>
              <FormField label="Хаяг"><input value={empForm.address} onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Салбар">
                <select value={empForm.stationId} onChange={(e) => setEmpForm({ ...empForm, stationId: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-2 text-sm">
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </FormField>
              <FormField label="Тухайн салбарын эрх">
                <select value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value as RoleKey })} className="min-h-touch w-full rounded-xl border bg-background px-2 text-sm">
                  {ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Нэвтрэх нэр">
                <input value={empForm.username} onChange={(e) => setEmpForm({ ...empForm, username: e.target.value })} disabled={!!empForm.id} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm disabled:opacity-60" />
              </FormField>
              {empForm.id ? (
                <div className="flex items-end pb-2 text-xs text-muted-foreground">Нууц үгийг 🔑 товчоор сэргээнэ</div>
              ) : (
                <FormField label="Нууц үг (≥8)">
                  <input value={empForm.password} onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })} type="password" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
                </FormField>
              )}
            </div>
            <Toggle checked={empForm.isActive} onChange={(v) => setEmpForm({ ...empForm, isActive: v })} label="Идэвхтэй" />
          </div>
          <ModalActions onCancel={() => setEmpForm(null)} onSave={saveEmp} busy={busy} saveLabel={empForm.id ? 'Хадгалах' : 'Бүртгэх'} />
        </Modal>
      )}

      {/* Нууц үг сэргээх модал */}
      {resetFor && (
        <Modal title="Нэвтрэх нууц үг сэргээх" onClose={() => setResetFor(null)}>
          <p className="mb-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{resetFor.lastName} {resetFor.firstName}</span> ({resetFor.user?.username})
          </p>
          <FormField label="Шинэ нууц үг (≥8)">
            <input value={resetPass} onChange={(e) => setResetPass(e.target.value)} type="password" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
          </FormField>
          <ModalActions onCancel={() => setResetFor(null)} onSave={doReset} busy={busy} saveLabel="Сэргээх" />
        </Modal>
      )}
    </main>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Store; text: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
      <Icon size={28} className="mb-2 opacity-40" />
      {text}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm animate-overlay sm:items-center sm:p-4">
        <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl animate-pop sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" aria-label="Хаах"><X size={18} /></button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}
function ModalActions({ onCancel, onSave, busy, saveLabel = 'Хадгалах' }: { onCancel: () => void; onSave: () => void; busy: boolean; saveLabel?: string }) {
  return (
    <div className="mt-5 flex gap-2">
      <button onClick={onCancel} className="min-h-touch flex-1 rounded-xl border bg-card font-medium hover:bg-accent">Болих</button>
      <button onClick={onSave} disabled={busy} className="min-h-touch flex-1 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm hover:brightness-105 disabled:opacity-50">
        {busy ? 'Хадгалж байна…' : saveLabel}
      </button>
    </div>
  );
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm">
      <span className={`relative h-6 w-10 rounded-full transition ${checked ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.125rem]' : 'left-0.5'}`} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function RoleEditor({ role, perms, busy, onSave }: { role: AdminRole; perms: Permission[]; busy: boolean; onSave: (keys: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissionKeys));
  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><Shield size={16} /></span>
          {role.name} <span className="text-xs font-normal text-muted-foreground">({role.key})</span>
        </h3>
        <button onClick={() => onSave([...selected])} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
          <Save size={15} /> Хадгалах
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {perms.map((p) => {
          const active = selected.has(p.key);
          return (
            <label key={p.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-accent'}`}>
              <input type="checkbox" checked={active} onChange={() => toggle(p.key)} className="sr-only" />
              {active ? <Check size={13} /> : <span className="h-3 w-3 rounded-sm border border-current opacity-50" />}
              {p.key}
            </label>
          );
        })}
      </div>
    </div>
  );
}
