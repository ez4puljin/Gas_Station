'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FileText,
  Receipt,
  ShoppingCart,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react';
import { formatMnt } from '@fuel/schemas';
import { SALE_STATUS_LABEL, type SaleStatus } from '@fuel/types';
import { ApiException, apiFetch, tokenStore } from '@/lib/api';
import { controlApi, type Overview, type OverviewStation } from '@/lib/control-api';
import { customersApi } from '@/lib/customers-api';
import { posApi, type SaleListItem, type StationDto } from '@/lib/pos-api';

type Icon = ComponentType<{ size?: number; className?: string }>;

function sumBig(arr: string[]): bigint {
  return arr.reduce((a, s) => a + BigInt(s || '0'), 0n);
}

function ubDateLabel(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()} оны ${String(d.getUTCMonth() + 1).padStart(2, '0')} сарын ${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

const QUICK: { href: string; label: string; icon: Icon; tint: string }[] = [
  { href: '/pos', label: 'Борлуулалт хийх', icon: ShoppingCart, tint: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40' },
  { href: '/inventory', label: 'Нөөц шалгах', icon: Warehouse, tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' },
  { href: '/staff', label: 'Ээлж нээх / хаах', icon: ClipboardCheck, tint: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' },
  { href: '/reports', label: 'Тайлан үзэх', icon: FileText, tint: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<{ name: string | null } | null>(null);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<SaleListItem[]>([]);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        setMe(await apiFetch<{ name: string | null }>('/auth/me'));
      } catch (e) {
        if (e instanceof ApiException && e.error.statusCode === 401) {
          tokenStore.clear();
          router.replace('/login');
          return;
        }
      }
      // Best-effort — зарим endpoint эрх шаардана (cashier-д overview 403). Алдааг чимээгүй алгасна.
      void posApi.stations().then(setStations).catch(() => {});
      void controlApi.overview().then(setOverview).catch(() => {});
      void customersApi.list().then((c) => setCustomerCount(c.length)).catch(() => {});
      void posApi.listSales({ pageSize: 6 }).then((r) => setRecent(r.items)).catch(() => {});
      setReady(true);
    })();
  }, [router]);

  if (!ready) {
    return <main className="grid min-h-[60vh] place-items-center text-muted-foreground">Ачаалж байна…</main>;
  }

  const firstName = me?.name?.trim().split(' ')[0] || 'Хэрэглэгч';
  const todayGross = overview ? sumBig(overview.stations.map((s) => s.todayGrossMnt)) : null;
  const salesCount = overview ? overview.stations.reduce((a, s) => a + s.salesCount, 0) : null;
  const openShifts = overview ? overview.stations.filter((s) => s.shift?.status === 'OPEN').length : null;
  const pending = overview?.pending ?? [];
  const stationRows: OverviewStation[] =
    overview?.stations ??
    stations.map((s) => ({ station: s, shift: null, salesCount: 0, todayGrossMnt: '0', byMethod: {} }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Мэндчилгээ */}
      <div className="mb-7">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Сайн байна уу, {firstName}!</h2>
        <p className="mt-1 text-sm text-muted-foreground">{ubDateLabel()} — Өнөөдрийн тойм</p>
      </div>

      {/* Статистик карт */}
      <section className="stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Өнөөдрийн борлуулалт"
          value={todayGross !== null ? formatMnt(todayGross) : '—'}
          sub={salesCount !== null ? `${salesCount} гүйлгээ` : 'Эрх хязгаарлагдсан'}
          icon={Coins}
          gradient="from-blue-500 to-blue-600 shadow-blue-500/30"
        />
        <StatCard
          label="Нээлттэй ээлж"
          value={openShifts !== null ? `${openShifts}/${stationRows.length}` : '—'}
          sub="идэвхтэй ээлж"
          icon={ClipboardCheck}
          gradient="from-amber-400 to-orange-500 shadow-orange-500/30"
        />
        <StatCard
          label="Салбар"
          value={String(stationRows.length)}
          sub="нийт салбар"
          icon={Building2}
          gradient="from-emerald-500 to-green-600 shadow-emerald-500/30"
        />
        <StatCard
          label="Харилцагч"
          value={customerCount !== null ? String(customerCount) : '—'}
          sub="бүртгэлтэй"
          icon={Users}
          gradient="from-violet-500 to-purple-600 shadow-purple-500/30"
        />
      </section>

      {/* Хүлээгдэж буй хүсэлт */}
      {pending.length > 0 && (
        <Link
          href="/control"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm shadow-sm transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/30"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600">
            <ClipboardCheck size={18} />
          </span>
          <span className="font-medium text-amber-900 dark:text-amber-200">
            Ээлжийн {pending.length} хүсэлт батлахыг хүлээж байна
          </span>
          <ChevronRight size={18} className="ml-auto text-amber-600" />
        </Link>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Салбарын төлөв */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Building2 size={18} className="text-muted-foreground" /> Салбарын төлөв
            </h3>
            <Link href="/control" className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
              Дэлгэрэнгүй <ChevronRight size={15} />
            </Link>
          </div>
          {stationRows.length === 0 ? (
            <Empty icon={Building2} text="Салбар алга" />
          ) : (
            <ul className="space-y-2.5">
              {stationRows.map((s) => (
                <li key={s.station.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Building2 size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.station.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{s.station.code}</div>
                  </div>
                  {overview && (
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-blue-600">{formatMnt(s.todayGrossMnt)}</div>
                      <ShiftChip status={s.shift?.status ?? null} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Шуурхай үйлдлүүд */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Шуурхай үйлдлүүд</h3>
          <div className="grid grid-cols-2 gap-3">
            {QUICK.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.href}
                  href={q.href as never}
                  className="group flex flex-col gap-3 rounded-2xl border border-border p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${q.tint}`}>
                    <Icon size={20} />
                  </span>
                  <span className="text-sm font-semibold">{q.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* Сүүлийн борлуулалт */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <Receipt size={18} className="text-muted-foreground" /> Сүүлийн борлуулалт
          </h3>
          <Link href="/reports/history" className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
            Бүгдийг харах <ChevronRight size={15} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <Empty icon={Receipt} text="Борлуулалт алга" />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-muted-foreground">
                  {s.saleNumber ? `#${s.saleNumber}` : <Receipt size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {s.customerName ?? s.cashierName ?? s.stationLabel ?? 'Борлуулалт'}
                    </span>
                    <SaleStatusChip status={s.status as SaleStatus} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound size={11} /> {s.cashierName ?? '—'} · {new Date(s.soldAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-600">{formatMnt(s.totalMnt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: string;
  sub: string;
  icon: Icon;
  gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg sm:p-5`}>
      <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-12 right-2 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-white/90 sm:text-sm">{label}</span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20">
            <Icon size={18} />
          </span>
        </div>
        <div className="mt-5 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</div>
        <div className="mt-0.5 text-[11px] text-white/80 sm:text-xs">{sub}</div>
      </div>
    </div>
  );
}

function ShiftChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-[11px] text-muted-foreground">Ээлж алга</span>;
  const open = status === 'OPEN';
  return (
    <span
      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
        open ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      }`}
    >
      {open ? 'Нээлттэй' : 'Хүлээгдэж буй'}
    </span>
  );
}

function SaleStatusChip({ status }: { status: SaleStatus }) {
  const tone =
    status === 'COMPLETED'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : status === 'VOIDED'
        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {SALE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Empty({ icon: Icon, text }: { icon: Icon; text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
      <Icon size={24} className="mb-1.5 opacity-40" />
      {text}
    </div>
  );
}
