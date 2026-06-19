'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Fuel,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { formatMnt, lineTotalMnt, toMilliUnits } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import { adminApi, type TankDto } from '@/lib/admin-api';
import { inventoryApi, type ProductDto } from '@/lib/inventory-api';
import { posApi, type StationDto } from '@/lib/pos-api';
import {
  type Purchase,
  type PurchaseLineStatusT,
  procurementApi,
  type Supplier,
} from '@/lib/procurement-api';

interface FuelGrade {
  id: string;
  code: string;
  name: string;
}

/** Захиалгын ноорог мөр (UI). */
interface DraftLine {
  key: string;
  stationId: string;
  itemType: 'FUEL' | 'PRODUCT';
  fuelGradeId: string;
  tankId: string;
  productId: string;
  quantity: string;
  unitCostMnt: string;
}

let draftSeq = 0;
const newDraft = (): DraftLine => ({
  key: `d${++draftSeq}`,
  stationId: '',
  itemType: 'FUEL',
  fuelGradeId: '',
  tankId: '',
  productId: '',
  quantity: '',
  unitCostMnt: '',
});

/** Мөр-түвшний өртөг урьдчилан тооцох (float-гүй; сервер эцэслэн дахин бодно). */
function previewLineMnt(unitCost: string, qty: string): bigint {
  try {
    if (!unitCost || !qty) return 0n;
    return lineTotalMnt(BigInt(unitCost), toMilliUnits(qty));
  } catch {
    return 0n;
  }
}

const STATUS_BADGE: Record<PurchaseLineStatusT, { label: string; cls: string }> = {
  PENDING: { label: 'Хүлээгдэж буй', cls: 'bg-amber-500/15 text-amber-700' },
  RECEIVED: { label: 'Хүлээн авсан', cls: 'bg-emerald-500/15 text-emerald-700' },
  CANCELLED: { label: 'Цуцалсан', cls: 'bg-muted text-muted-foreground' },
};
const PURCHASE_BADGE: Record<Purchase['status'], { label: string; cls: string }> = {
  PARTIAL: { label: 'Хүлээгдэж буй', cls: 'bg-amber-500/15 text-amber-700' },
  RECEIVED: { label: 'Бүрэн авсан', cls: 'bg-emerald-500/15 text-emerald-700' },
  CANCELLED: { label: 'Цуцалсан', cls: 'bg-muted text-muted-foreground' },
};

export default function ProcurementPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [grades, setGrades] = useState<FuelGrade[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [tanksByStation, setTanksByStation] = useState<Record<string, TankDto[]>>({});

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // create form
  const [supplierId, setSupplierId] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newDraft()]);

  const reloadPurchases = useCallback(async () => {
    setPurchases(await procurementApi.purchases());
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    Promise.all([
      procurementApi.suppliers(),
      posApi.stations(),
      adminApi.fuelGrades(),
      inventoryApi.products(),
      procurementApi.purchases(),
    ])
      .then(([sup, st, gr, pr, pu]) => {
        setSuppliers(sup.filter((s) => s.isActive));
        setStations(st);
        setGrades(gr);
        setProducts(pr.filter((p) => p.isActive));
        setPurchases(pu);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Ачаалахад алдаа гарлаа');
      })
      .finally(() => setReady(true));
  }, [router]);

  // Сонгосон салбарын савнуудыг lazy ачаална (кэш).
  const ensureTanks = useCallback(
    async (stationId: string) => {
      if (!stationId || tanksByStation[stationId]) return;
      try {
        const t = await adminApi.tanks(stationId);
        setTanksByStation((prev) => ({ ...prev, [stationId]: t.filter((x) => x.isActive) }));
      } catch {
        setTanksByStation((prev) => ({ ...prev, [stationId]: [] }));
      }
    },
    [tanksByStation],
  );

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const grandTotal = useMemo(
    () => lines.reduce((acc, l) => acc + previewLineMnt(l.unitCostMnt, l.quantity), 0n),
    [lines],
  );

  function resetForm() {
    setSupplierId('');
    setDocumentNo('');
    setNote('');
    setLines([newDraft()]);
  }

  function validLine(l: DraftLine): boolean {
    if (!l.stationId || !l.quantity || !l.unitCostMnt) return false;
    return l.itemType === 'FUEL' ? !!l.fuelGradeId && !!l.tankId : !!l.productId;
  }

  async function submitPurchase() {
    if (!supplierId) {
      setError('Нийлүүлэгч сонгоно уу');
      return;
    }
    const valid = lines.filter(validLine);
    if (valid.length === 0) {
      setError('Дор хаяж нэг бүрэн мөр шаардлагатай');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await procurementApi.createPurchase({
        supplierId,
        documentNo: documentNo || undefined,
        note: note || undefined,
        lines: valid.map((l) => ({
          stationId: l.stationId,
          itemType: l.itemType,
          fuelGradeId: l.itemType === 'FUEL' ? l.fuelGradeId : undefined,
          tankId: l.itemType === 'FUEL' ? l.tankId : undefined,
          productId: l.itemType === 'PRODUCT' ? l.productId : undefined,
          quantity: l.quantity,
          unitCostMnt: l.unitCostMnt,
        })),
      });
      resetForm();
      setCreating(false);
      await reloadPurchases();
      setMsg('Худалдан авалт үүслээ. Салбар бүрт “Хүлээн авах” дарж нөөцөд оруулна.');
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function receiveLine(lineId: string) {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await procurementApi.receiveLine(detail.id, lineId);
      const updated = await procurementApi.purchase(detail.id);
      setDetail(updated);
      await reloadPurchases();
      setMsg('Мөр хүлээн авч, нөөц/савыг шинэчиллээ');
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function cancelLine(lineId: string) {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await procurementApi.cancelLine(detail.id, lineId);
      const updated = await procurementApi.purchase(detail.id);
      setDetail(updated);
      await reloadPurchases();
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (!ready)
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6">
      <PageHeader icon={Truck} title="Худалдан авалт" subtitle="Нийлүүлэгчээс түлш/бараа авч салбаруудад хуваарилах">
        <button
          onClick={() => {
            setCreating(true);
            setError(null);
          }}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105"
        >
          <Plus size={16} /> Шинэ худалдан авалт
        </button>
      </PageHeader>

      {error && !creating && !detail && (
        <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {msg && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={15} /> {msg}
        </p>
      )}

      {/* Худалдан авалтын жагсаалт */}
      <div className="space-y-3">
        {purchases.map((p) => {
          const badge = PURCHASE_BADGE[p.status];
          return (
            <button
              key={p.id}
              onClick={() => {
                setDetail(p);
                setError(null);
                setMsg(null);
              }}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow"
            >
              <span className="font-mono text-sm font-semibold text-primary">{p.purchaseNo}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Building2 size={14} className="text-muted-foreground" /> {p.supplierName}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
              <span className="text-xs text-muted-foreground">
                {p.receivedCount}/{p.lineCount} мөр авсан
                {p.pendingCount > 0 && ` · ${p.pendingCount} хүлээгдэж буй`}
              </span>
              <span className="ml-auto text-sm font-semibold tabular-nums">{formatMnt(p.totalCostMnt)}</span>
              <span className="w-full text-xs text-muted-foreground">
                {new Date(p.createdAt).toLocaleString('mn-MN')}
                {p.documentNo && ` · Падаан: ${p.documentNo}`}
              </span>
            </button>
          );
        })}
        {purchases.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
            <Truck size={28} className="mb-2 opacity-40" />
            Худалдан авалт алга. “Шинэ худалдан авалт” дарж эхлүүлнэ үү.
          </div>
        )}
      </div>

      {/* ── Шинэ худалдан авалт модал ── */}
      {creating && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8">
            <div className="w-full max-w-3xl rounded-2xl border bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ShoppingBag size={18} className="text-primary" /> Шинэ худалдан авалт
                </h2>
                <button onClick={() => setCreating(false)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Хаах">
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
                {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Нийлүүлэгч *</span>
                    <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm">
                      <option value="">— сонгох —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Падаан / нэхэмжлэх №</span>
                    <input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Тэмдэглэл</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
                  </label>
                </div>

                {/* Мөрүүд */}
                <div className="space-y-3">
                  {lines.map((l, idx) => {
                    const tanks = (tanksByStation[l.stationId] ?? []).filter(
                      (t) => !l.fuelGradeId || t.fuelGradeId === l.fuelGradeId,
                    );
                    const lineMnt = previewLineMnt(l.unitCostMnt, l.quantity);
                    return (
                      <div key={l.key} className="rounded-xl border bg-background/60 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">Мөр {idx + 1}</span>
                          {lines.length > 1 && (
                            <button onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive" aria-label="Мөр устгах">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {/* Салбар */}
                          <label className="col-span-2 block sm:col-span-1">
                            <span className="mb-1 block text-[11px] text-muted-foreground">Салбар</span>
                            <select
                              value={l.stationId}
                              onChange={(e) => {
                                patchLine(l.key, { stationId: e.target.value, tankId: '' });
                                void ensureTanks(e.target.value);
                              }}
                              className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm"
                            >
                              <option value="">—</option>
                              {stations.map((s) => (
                                <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                              ))}
                            </select>
                          </label>
                          {/* Төрөл */}
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-muted-foreground">Төрөл</span>
                            <select
                              value={l.itemType}
                              onChange={(e) => patchLine(l.key, { itemType: e.target.value as 'FUEL' | 'PRODUCT', fuelGradeId: '', tankId: '', productId: '' })}
                              className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm"
                            >
                              <option value="FUEL">Түлш</option>
                              <option value="PRODUCT">Бараа</option>
                            </select>
                          </label>

                          {l.itemType === 'FUEL' ? (
                            <>
                              <label className="block">
                                <span className="mb-1 block text-[11px] text-muted-foreground">Грейд</span>
                                <select value={l.fuelGradeId} onChange={(e) => patchLine(l.key, { fuelGradeId: e.target.value, tankId: '' })} className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm">
                                  <option value="">—</option>
                                  {grades.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] text-muted-foreground">Сав</span>
                                <select value={l.tankId} onChange={(e) => patchLine(l.key, { tankId: e.target.value })} disabled={!l.stationId} className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm disabled:opacity-50">
                                  <option value="">{l.stationId ? '—' : 'Салбар эхэлнэ'}</option>
                                  {tanks.map((t) => (
                                    <option key={t.id} value={t.id}>{t.code} ({t.fuelGrade.name})</option>
                                  ))}
                                </select>
                              </label>
                            </>
                          ) : (
                            <label className="col-span-2 block">
                              <span className="mb-1 block text-[11px] text-muted-foreground">Бараа</span>
                              <select
                                value={l.productId}
                                onChange={(e) => {
                                  const p = products.find((x) => x.id === e.target.value);
                                  patchLine(l.key, { productId: e.target.value, unitCostMnt: l.unitCostMnt || (p?.costMnt ?? '') });
                                }}
                                className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm"
                              >
                                <option value="">—</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                                ))}
                              </select>
                            </label>
                          )}

                          {/* Хэмжээ */}
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-muted-foreground">{l.itemType === 'FUEL' ? 'Хэмжээ (л)' : 'Тоо хэмжээ'}</span>
                            <input value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="0" className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm" />
                          </label>
                          {/* Нэгж өртөг */}
                          <label className="block">
                            <span className="mb-1 block text-[11px] text-muted-foreground">Нэгж өртөг (₮)</span>
                            <input value={l.unitCostMnt} onChange={(e) => patchLine(l.key, { unitCostMnt: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" placeholder="0" className="min-h-touch w-full rounded-lg border bg-background px-2 text-sm" />
                          </label>
                          {/* Мөрийн дүн */}
                          <div className="col-span-2 flex items-end justify-end sm:col-span-2">
                            <span className="text-sm font-semibold tabular-nums">
                              {lineMnt > 0n ? formatMnt(lineMnt) : <span className="text-muted-foreground">—</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setLines((p) => [...p, newDraft()])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent">
                    <Plus size={15} /> Мөр нэмэх
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Нийт: </span>
                  <span className="text-lg font-semibold tabular-nums">{formatMnt(grandTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCreating(false)} className="min-h-touch rounded-xl border px-4 text-sm font-medium transition hover:bg-accent">Болих</button>
                  <button onClick={submitPurchase} disabled={busy || !supplierId} className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-50">
                    <ShoppingBag size={16} /> Үүсгэх
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Дэлгэрэнгүй / хүлээн авах модал ── */}
      {detail && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8" onClick={() => setDetail(null)}>
            <div className="w-full max-w-3xl rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <span className="font-mono text-primary">{detail.purchaseNo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PURCHASE_BADGE[detail.status].cls}`}>{PURCHASE_BADGE[detail.status].label}</span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {detail.supplierName}
                    {detail.documentNo && ` · Падаан: ${detail.documentNo}`}
                  </p>
                </div>
                <button onClick={() => setDetail(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Хаах">
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
                {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                {detail.note && <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{detail.note}</p>}

                {detail.lines.map((l) => {
                  const badge = STATUS_BADGE[l.status];
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-background/60 p-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        {l.itemType === 'FUEL' ? <Fuel size={15} /> : <Package size={15} />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {l.itemType === 'FUEL' ? `${l.gradeLabel} — ${l.tankCode}` : l.productName}
                        </div>
                        <div className="text-xs text-muted-foreground">{l.stationLabel}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      <div className="ml-auto text-right">
                        <div className="text-sm font-semibold tabular-nums">{formatMnt(l.totalCostMnt)}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {l.quantity} {l.unit ?? ''} × {formatMnt(l.unitCostMnt)}
                        </div>
                      </div>
                      {l.status === 'PENDING' && (
                        <div className="flex w-full justify-end gap-2 sm:w-auto sm:flex-col">
                          <button onClick={() => receiveLine(l.id)} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50">
                            <CheckCircle2 size={14} /> Хүлээн авах
                          </button>
                          <button onClick={() => cancelLine(l.id)} disabled={busy} className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition hover:bg-accent disabled:opacity-50">
                            <X size={14} /> Цуцлах
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t px-5 py-4 text-sm">
                <span className="text-muted-foreground">{detail.receivedCount}/{detail.lineCount} мөр хүлээн авсан</span>
                <span><span className="text-muted-foreground">Нийт: </span><span className="text-lg font-semibold tabular-nums">{formatMnt(detail.totalCostMnt)}</span></span>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </main>
  );
}
