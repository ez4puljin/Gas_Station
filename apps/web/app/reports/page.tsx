'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Boxes,
  ClipboardList,
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

const REPORTS = [
  { href: '/reports/sales', title: 'Борлуулалтын тайлан', desc: 'Огнооны муж, харилцагч/түлш/бараагаар бүх борлуулалт.', icon: ReceiptText },
  { href: '/reports/history', title: 'Борлуулалтын түүх', desc: 'Гүйлгээ бүрийн дэлгэрэнгүй, буцаалт / цуцлалт хийх.', icon: ClipboardList },
  { href: '/reports/ledger', title: 'Авлага-өглөгийн дэвтэр', desc: 'Харилцагчийн эхний/эцсийн үлдэгдэл, дебет/кредит.', icon: HandCoins },
  { href: '/reports/vat', title: 'НӨАТ тайлан', desc: 'Борлуулалтын НӨАТ (10%), татвартай/чөлөөлөгдсөн.', icon: PercentCircle },
  { href: '/reports/shifts', title: 'Ээлжийн тайлан (Z)', desc: 'Ээлжийн түүх, хаалтын Z-тайлан, тооцоо нийлэлт.', icon: FileText },
  { href: '/reports/margin', title: 'Түлшний маржин', desc: 'Грейдээр орлого, өртөг, ашгийн хувь.', icon: TrendingUp },
  { href: '/reports/deliveries', title: 'Түлшний нийлүүлэлт', desc: 'Нийлүүлэгч, грейдээр хүлээн авсан түлш, өртөг.', icon: Truck },
  { href: '/reports/valuation', title: 'Нөөцийн үнэлгээ', desc: 'Одоогийн бараа + түлшний нөөцийн мөнгөн үнэлгээ.', icon: Boxes },
  { href: '/reports/movements', title: 'Нөөцийн хөдөлгөөн', desc: 'Хүлээн авалт, борлуулалт, засвар, шилжүүлэг (ledger).', icon: Banknote },
  { href: '/reports/fuel-recon', title: 'Түлшний тулгалт', desc: 'Сав тус бүрээр нийлүүлэлт − зарсан + буцаалт.', icon: Droplets },
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader icon={FileText} title="Тайлан" subtitle="Бүх тайлан — хэвлэх + Excel татах" />

      <section className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="font-semibold">{r.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
