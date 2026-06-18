'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Warehouse } from 'lucide-react';
import { LiquidTank } from '@/components/liquid-tank';
import { PageHeader } from '@/components/page-header';
import { formatMnt } from '@fuel/schemas';
import { ApiException, apiFetch, tokenStore } from '@/lib/api';
import {
  inventoryApi,
  type ProductDto,
  type StockOverview,
  type StockTank,
} from '@/lib/inventory-api';
import { posApi, type StationDto } from '@/lib/pos-api';

export default function InventoryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState('');
  const [stock, setStock] = useState<StockOverview | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [allStock, setAllStock] = useState<{ station: StationDto; tanks: StockTank[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Delivery form
  const [delTank, setDelTank] = useState('');
  const [delLiters, setDelLiters] = useState('');
  const [delCost, setDelCost] = useState('');

  // Adjustment form
  const [adjProduct, setAdjProduct] = useState('');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Бүх салбарын резервуарын түвшин (liquid gauge-д). Алдаатай салбарыг хоосноор алгасна.
  const reloadAllTanks = useCallback(async (list: StationDto[]) => {
    const results = await Promise.all(
      list.map((s) =>
        inventoryApi.stock(s.id).then(
          (st) => ({ station: s, tanks: st.tanks }),
          () => ({ station: s, tanks: [] as StockTank[] }),
        ),
      ),
    );
    setAllStock(results);
  }, []);

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
        void reloadAllTanks(list);
        setReady(true);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Салбар ачаалахад алдаа гарлаа');
        setReady(true);
      });
  }, [router, reloadAllTanks]);

  const reload = useCallback(async (sid: string) => {
    setError(null);
    try {
      const [s, p] = await Promise.all([inventoryApi.stock(sid), inventoryApi.products()]);
      setStock(s);
      setProducts(p);
    } catch {
      setError('Өгөгдөл ачаалахад алдаа гарлаа');
    }
  }, []);

  useEffect(() => {
    if (stationId) void reload(stationId);
  }, [stationId, reload]);

  async function submitDelivery() {
    if (!delTank || !delLiters || !delCost) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await inventoryApi.receiveDelivery({
        stationId,
        tankId: delTank,
        liters: delLiters,
        unitCostMnt: delCost,
      });
      setMsg('Нийлүүлэлт хүлээн авлаа');
      setDelLiters('');
      setDelCost('');
      await reload(stationId);
      void reloadAllTanks(stations);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjustment() {
    if (!adjProduct || !adjDelta || adjReason.length < 3) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await inventoryApi.adjust({
        stationId,
        productId: adjProduct,
        quantityDelta: adjDelta,
        reason: adjReason,
      });
      setMsg('Нөөц засагдлаа');
      setAdjDelta('');
      setAdjReason('');
      await reload(stationId);
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <main className="p-8 text-center text-muted-foreground">Ачаалж байна…</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader icon={Warehouse} title="Нөөц / Агуулах" subtitle="Резервуар, бараа, нийлүүлэлт, тооллого">
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="min-h-touch rounded-xl border bg-card px-3 text-sm shadow-sm"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
      </PageHeader>

      {error && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">{msg}</p>}

      {/* ── Бүх салбарын резервуарын түвшин (шингэн долгион) ── */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Резервуарын түвшин</h2>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Бүх салбар
          </span>
        </div>
        {allStock.every((g) => g.tanks.length === 0) ? (
          <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">
            Резервуар бүртгэгдээгүй
          </div>
        ) : (
          <div className="space-y-5">
            {allStock.map((g) =>
              g.tanks.length === 0 ? null : (
                <div key={g.station.id}>
                  {allStock.filter((x) => x.tanks.length > 0).length > 1 && (
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{g.station.code}</span>
                      <span className="font-medium">{g.station.name}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {g.tanks.map((t) => (
                      <LiquidTank
                        key={t.tankId}
                        code={t.code}
                        grade={t.grade}
                        current={Number(t.currentLiters)}
                        capacity={Number(t.capacityLiters)}
                        min={Number(t.minLiters)}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Бараа */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Барааны үлдэгдэл</h2>
          {stock && stock.products.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Бараа алга</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2">Бараа</th>
                  <th className="pb-2 text-right">Үлдэгдэл</th>
                </tr>
              </thead>
              <tbody>
                {stock?.products.map((p) => (
                  <tr key={p.productId}>
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 text-right">
                      {Number(p.quantity)} {p.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Нийлүүлэлт хүлээн авах */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Түлш хүлээн авах</h2>
          <label className="mb-1 block text-sm font-medium">Сав</label>
          <select
            value={delTank}
            onChange={(e) => setDelTank(e.target.value)}
            className="mb-3 min-h-touch w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— сонгох —</option>
            {stock?.tanks.map((t) => (
              <option key={t.tankId} value={t.tankId}>
                {t.code} ({t.grade})
              </option>
            ))}
          </select>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Литр</label>
              <input
                value={delLiters}
                onChange={(e) => setDelLiters(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                className="min-h-touch w-full rounded-md border bg-background px-3"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Литрийн өртөг (₮)</label>
              <input
                value={delCost}
                onChange={(e) => setDelCost(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                className="min-h-touch w-full rounded-md border bg-background px-3"
              />
            </div>
          </div>
          {delLiters && delCost && (
            <p className="mb-3 text-sm text-muted-foreground">
              Нийт өртөг: {formatMnt(BigInt(delCost || '0') * BigInt(Math.round(Number(delLiters) || 0)))}
            </p>
          )}
          <button
            onClick={submitDelivery}
            disabled={busy || !delTank || !delLiters || !delCost}
            className="min-h-touch w-full rounded-md bg-primary font-medium text-primary-foreground disabled:opacity-50"
          >
            Хүлээн авах
          </button>
        </section>

        {/* Барааны нөөц засвар */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Барааны нөөц засвар</h2>
          <label className="mb-1 block text-sm font-medium">Бараа</label>
          <select
            value={adjProduct}
            onChange={(e) => setAdjProduct(e.target.value)}
            className="mb-3 min-h-touch w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— сонгох —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="mb-1 block text-sm font-medium">Өөрчлөлт (+/-)</label>
          <input
            value={adjDelta}
            onChange={(e) => setAdjDelta(e.target.value.replace(/[^\d.-]/g, ''))}
            inputMode="decimal"
            placeholder="ж: 50 эсвэл -10"
            className="mb-3 min-h-touch w-full rounded-md border bg-background px-3"
          />
          <label className="mb-1 block text-sm font-medium">Шалтгаан (заавал)</label>
          <input
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            placeholder="ж: тооллогын зөрүү"
            className="mb-3 min-h-touch w-full rounded-md border bg-background px-3"
          />
          <button
            onClick={submitAdjustment}
            disabled={busy || !adjProduct || !adjDelta || adjReason.length < 3}
            className="min-h-touch w-full rounded-md bg-primary font-medium text-primary-foreground disabled:opacity-50"
          >
            Засах
          </button>
        </section>
      </div>
    </main>
  );
}
