'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BarChart3, Fuel, Lock, ShoppingCart, User, Warehouse } from 'lucide-react';
import { type AuthTokens, loginSchema } from '@fuel/schemas';
import { ApiException, apiFetch, tokenStore } from '@/lib/api';

const FEATURES = [
  { icon: ShoppingCart, label: 'Борлуулалт' },
  { icon: Warehouse, label: 'Агуулах' },
  { icon: BarChart3, label: 'Санхүү' },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Оролт буруу байна');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<AuthTokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      tokenStore.set(res.accessToken, res.refreshToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Холболтын алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      {/* ── Зүүн: брэнд самбар ── */}
      <section className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12">
        {/* Гэрэлтэх чимэглэл */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 flex max-w-md flex-col items-center text-center">
          <div className="mb-7 grid h-24 w-24 place-items-center rounded-[28px] bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-2xl shadow-blue-500/40">
            <Fuel size={48} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">Шатахуун ERP</h1>
          <p className="mt-3 text-balance leading-relaxed text-slate-300">
            Борлуулалт, агуулах, ажилтан, санхүүгийн нэгдсэн удирдлагын систем
          </p>

          <div className="mt-10 grid w-full grid-cols-3 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.label}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-4 backdrop-blur-sm"
                >
                  <Icon size={24} className="text-blue-300" />
                  <span className="text-xs font-medium text-slate-200">{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Баруун: нэвтрэх форм ── */}
      <section className="flex w-full flex-col items-center justify-center px-4 py-10 lg:w-1/2">
        {/* Мобайл брэнд */}
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <div className="mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl shadow-blue-500/30">
            <Fuel size={32} />
          </div>
          <div className="text-xl font-bold tracking-tight">Шатахуун ERP</div>
        </div>

        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-xl shadow-slate-900/5 sm:p-9"
        >
          <h2 className="text-2xl font-semibold tracking-tight">Нэвтрэх</h2>
          <p className="mt-1 text-sm text-muted-foreground">Системд нэвтрэхийн тулд мэдээллээ оруулна уу</p>

          {/* Нэвтрэх нэр */}
          <label className="mb-1.5 mt-7 block text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="username">
            Нэвтрэх нэр
          </label>
          <div className="relative">
            <User
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="min-h-touch w-full rounded-2xl border border-border bg-background pl-10 pr-3 text-sm outline-none ring-ring transition focus:ring-2"
            />
          </div>

          {/* Нууц үг */}
          <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="password">
            Нууц үг
          </label>
          <div className="relative">
            <Lock
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-touch w-full rounded-2xl border border-border bg-background pl-10 pr-3 text-sm outline-none ring-ring transition focus:ring-2"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-105 disabled:opacity-50"
          >
            {loading ? 'Нэвтэрч байна…' : 'Нэвтрэх'}
          </button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">Шатахуун ERP v1.0 — Станц &amp; POS Систем</p>
      </section>
    </main>
  );
}
