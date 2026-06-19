'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wallet,
  X,
} from 'lucide-react';
import { ROLE_LABEL, type RoleKey } from '@fuel/types';
import { ApiException, apiFetch, tokenStore } from '@/lib/api';

type Icon = ComponentType<{ size?: number; className?: string }>;

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** Хажуугийн цэс — салбараар бус, модулиар бүлэглэсэн (CLAUDE.md §7). */
const NAV: NavGroup[] = [
  { items: [{ href: '/', label: 'Хянах самбар', icon: LayoutDashboard }] },
  {
    title: 'Борлуулалт',
    items: [
      { href: '/pos', label: 'POS Борлуулалт', icon: ShoppingCart },
      { href: '/sales-history', label: 'Борлуулалтын түүх', icon: ClipboardList },
      { href: '/customers', label: 'Харилцагч / Авлага', icon: Wallet },
    ],
  },
  {
    title: 'Нөөц / Агуулах',
    items: [
      { href: '/inventory', label: 'Нөөц / Агуулах', icon: Warehouse },
      { href: '/materials', label: 'Бараа материал', icon: Boxes },
      { href: '/procurement', label: 'Худалдан авалт', icon: Truck },
      { href: '/suppliers', label: 'Нийлүүлэгч / Өглөг', icon: Building2 },
    ],
  },
  {
    title: 'Ажилтан',
    items: [
      { href: '/staff', label: 'Ажилтан / Ээлж', icon: Users },
      { href: '/control', label: 'Хяналтын самбар', icon: Gauge },
    ],
  },
  {
    title: 'Санхүү',
    items: [
      { href: '/finance', label: 'Санхүү / Самбар', icon: BarChart3 },
      { href: '/reports', label: 'Тайлан', icon: FileText },
    ],
  },
  { title: 'Систем', items: [{ href: '/admin', label: 'Админ', icon: Settings }] },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

/** pathname-аас идэвхтэй цэсийн item-ийг ол (хамгийн урт тохирох prefix). */
function activeItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return ALL_ITEMS[0];
  return ALL_ITEMS.filter((i) => i.href !== '/')
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

interface Me {
  name: string | null;
  roles?: RoleKey[];
  stations?: { id: string; code: string; name: string }[];
}

function roleLabel(me: Me | null): string {
  const r = me?.roles?.[0];
  return (r && ROLE_LABEL[r]) || 'Хэрэглэгч';
}
function initialOf(me: Me | null): string {
  const ch = me?.name?.trim()?.[0];
  return ch ? ch.toUpperCase() : 'Х';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const isLogin = pathname === '/login';
  // localStorage — зөвхөн client дээр. mount хүртэл chrome зураагүй (hydration таарна).
  const hasToken = mounted && !!tokenStore.access;
  const showChrome = mounted && hasToken && !isLogin;

  useEffect(() => setMounted(true), []);

  // Нэвтэрсэн үед хэрэглэгчийн профайл (нэр, эрх) татаж толгой/хажуу цэст харуулна.
  useEffect(() => {
    if (!mounted || isLogin || !tokenStore.access) {
      if (isLogin) setMe(null);
      return;
    }
    if (me) return;
    apiFetch<Me>('/auth/me')
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) {
          tokenStore.clear();
          setMe(null);
        }
      });
  }, [mounted, isLogin, pathname, me]);

  // Маршрут солигдоход мобайл drawer хаах.
  useEffect(() => setOpen(false), [pathname]);

  const active = useMemo(() => activeItem(pathname), [pathname]);

  async function logout() {
    try {
      if (tokenStore.refresh) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokenStore.refresh }),
        });
      }
    } catch {
      // best-effort — серверт алдаа гарсан ч локалаас цэвэрлэнэ
    }
    tokenStore.clear();
    setMe(null);
    router.replace('/login');
  }

  const TitleIcon = active?.icon ?? LayoutDashboard;

  // Slot-уудыг ижил DOM байрлалд барьж (children тогтмол индекстэй) — нэвтрэх хуудас /
  // нэвтрээгүй үед chrome нуугдана, гарч ирэхэд хуудсыг remount хийхгүй.
  return (
    <div className="min-h-screen">
      {/* Мобайл overlay */}
      {showChrome && open && (
        <button
          aria-label="Хаах"
          onClick={() => setOpen(false)}
          className="animate-overlay fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ── Хажуугийн цэс ── */}
      {showChrome && (
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col border-r border-border bg-card transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:translate-x-0 ${
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Лого */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-transparent px-5 py-[18px] dark:from-blue-950/30">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
            <Fuel size={22} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-bold leading-tight tracking-tight">Шатахуун ERP</div>
            <div className="truncate text-xs text-muted-foreground">Станц & POS</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="Цэс хаах"
          >
            <X size={18} />
          </button>
        </div>

        {/* Навигаци */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV.map((group, gi) => (
            <div key={group.title ?? gi}>
              {group.title && (
                <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active?.href === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href as never}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <Icon size={18} className={isActive ? '' : 'opacity-80'} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Хэрэглэгч */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white">
              {initialOf(me)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{me?.name ?? 'Хэрэглэгч'}</div>
              <div className="truncate text-xs text-muted-foreground">{roleLabel(me)}</div>
            </div>
            <button
              onClick={logout}
              title="Гарах"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      )}

      {/* ── Контентын багана ── */}
      <div className={showChrome ? 'flex min-h-screen flex-col lg:pl-[270px]' : undefined}>
        {/* Дээд мөр */}
        {showChrome && (
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="Цэс нээх"
          >
            <Menu size={20} />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <TitleIcon size={18} />
            </span>
            <h1 className="truncate text-base font-semibold sm:text-lg">{active?.label ?? 'Хянах самбар'}</h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                placeholder="Хайх…"
                className="h-10 w-48 rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none ring-ring transition focus:w-60 focus:ring-2 xl:w-56"
              />
            </div>
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-semibold leading-tight">{me?.name ?? 'Хэрэглэгч'}</div>
                <div className="text-xs text-muted-foreground">{roleLabel(me)}</div>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white">
                {initialOf(me)}
              </div>
            </div>
          </div>
        </header>
        )}

        {children}
      </div>
    </div>
  );
}
