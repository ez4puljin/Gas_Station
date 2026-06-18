import Link from 'next/link';
import { Home, MapPinOff } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-muted text-muted-foreground">
          <MapPinOff size={28} />
        </div>
        <p className="text-5xl font-bold tracking-tight text-muted-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold">Хуудас олдсонгүй</h1>
        <p className="mt-1 text-sm text-muted-foreground">Хайсан хуудас байхгүй эсвэл шилжсэн байна.</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-touch items-center justify-center gap-1.5 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition hover:brightness-105"
        >
          <Home size={16} /> Нүүр хуудас
        </Link>
      </div>
    </main>
  );
}
