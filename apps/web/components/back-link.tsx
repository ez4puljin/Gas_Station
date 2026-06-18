import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Дэд хуудаснаас нүүр хуудас (цэс) рүү буцах товч. */
export function BackLink({ href = '/', label = 'Буцах' }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="group mb-4 inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground"
    >
      <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
      {label}
    </Link>
  );
}
