'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  Clock,
  Droplets,
  FileText,
  Fuel,
  HandCoins,
  PercentCircle,
  ReceiptText,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { tokenStore } from '@/lib/api';

/** Тайлангууд — нягтлан бодох бүртгэлийн бүлэглэлээр (хайхад хялбар, мэргэжлийн дараалал). */
const GROUPS = [
  {
    title: 'Тооцоо нийлэх (авлага / өглөг)',
    hint: 'Эхний үлдэгдэл · Дебет · Кредит · Эцсийн үлдэгдэл',
    items: [
      { href: '/reports/receivables', title: 'Авлагын тооцооны бүртгэл', desc: 'БҮХ харилцагч нэг хүснэгтэд. Мөр дээр 2 дарж гүйлгээг задална.', icon: HandCoins, primary: true },
      { href: '/reports/payables', title: 'Өглөгийн тооцооны бүртгэл', desc: 'БҮХ нийлүүлэгч нэг хүснэгтэд. Мөр дээр 2 дарж гүйлгээг задална.', icon: Building2, primary: true },
      { href: '/reports/ledger', title: 'Харилцагчийн дэлгэрэнгүй', desc: 'Нэг харилцагчийн гүйлгээ бүрээр, доторх бараа/түлштэй.', icon: ReceiptText },
      { href: '/reports/supplier-ledger', title: 'Нийлүүлэгчийн дэлгэрэнгүй', desc: 'Нэг нийлүүлэгчийн гүйлгээ бүрээр, доторх бараа/түлштэй.', icon: Truck },
      { href: '/reports/aging', title: 'Насжилтын шинжилгээ', desc: '0–30 / 31–60 / 61–90 / 90+ хоногоор (FIFO).', icon: Clock },
    ],
  },
  {
    title: 'Санхүүгийн тайлан',
    hint: 'Ерөнхий дэвтрээс',
    items: [
      { href: '/reports/financial', title: 'Санхүүгийн тайлан', desc: 'Орлогын тайлан (P&L), Баланс, Гүйлгээний баланс.', icon: BookOpen },
      { href: '/reports/vat', title: 'НӨАТ тайлан', desc: 'Борлуулалтын НӨАТ (10%), татвартай/чөлөөлөгдсөн.', icon: PercentCircle },
      { href: '/reports/margin', title: 'Түлшний маржин', desc: 'Грейдээр орлого, өртөг, ашгийн хувь.', icon: TrendingUp },
    ],
  },
  {
    title: 'Борлуулалт / ээлж',
    items: [
      { href: '/reports/sales', title: 'Борлуулалтын тайлан', desc: 'Огнооны муж, харилцагч/түлш/бараагаар.', icon: ReceiptText },
      { href: '/reports/history', title: 'Борлуулалтын түүх', desc: 'Гүйлгээ бүрийн дэлгэрэнгүй, буцаалт / цуцлалт.', icon: ClipboardList },
      { href: '/reports/shifts', title: 'Ээлжийн тайлан (Z)', desc: 'Ээлжийн түүх, хаалтын Z-тайлан, тооцоо нийлэлт.', icon: FileText },
    ],
  },
  {
    title: 'Нөөц / түлш',
    items: [
      { href: '/reports/valuation', title: 'Нөөцийн үнэлгээ', desc: 'Бараа + түлшний нөөцийн мөнгөн үнэлгээ.', icon: Boxes },
      { href: '/reports/movements', title: 'Нөөцийн хөдөлгөөн', desc: 'Хүлээн авалт, борлуулалт, засвар, шилжүүлэг.', icon: Banknote },
      { href: '/reports/deliveries', title: 'Түлшний нийлүүлэлт', desc: 'Нийлүүлэгч, грейдээр хүлээн авсан түлш, өртөг.', icon: Truck },
      { href: '/reports/fuel-recon', title: 'Түлшний тулгалт', desc: 'Сав тус бүрээр нийлүүлэлт − зарсан + буцаалт.', icon: Droplets },
    ],
  },
] as const;

export default function ReportsHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <PageHeader icon={FileText} title="Тайлан" subtitle="Бүх тайлан — хэвлэх + Excel татах" />

      <div className="stagger space-y-8">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="mb-3 flex items-baseline gap-2 border-b pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide">{g.title}</h2>
              {'hint' in g && g.hint && <span className="text-xs text-muted-foreground">{g.hint}</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((r) => {
                const Icon = r.icon;
                const primary = 'primary' in r && r.primary;
                return (
                  <Link
                    key={r.href}
                    href={r.href}
                    className={`group rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      primary ? 'border-primary/30 ring-1 ring-primary/10' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                          primary ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-tight">{r.title}</h3>
                        <p className="mt-1 text-sm leading-snug text-muted-foreground">{r.desc}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
