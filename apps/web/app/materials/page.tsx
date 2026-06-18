'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import {
  Camera,
  Check,
  Image as ImageIcon,
  Package,
  Pencil,
  Plus,
  ScanLine,
  Search,
  Tags,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Portal } from '@/components/portal';
import { formatMnt } from '@fuel/schemas';
import { ApiException, tokenStore } from '@/lib/api';
import {
  inventoryApi,
  type ProductDto,
  type ProductGroupDto,
  type SupplierDto,
} from '@/lib/inventory-api';

interface ProductForm {
  id: string | null;
  imageUrl: string;
  sku: string;
  name: string;
  groupId: string;
  supplierId: string;
  barcode: string;
  unit: string;
  priceMnt: string;
  isVatable: boolean;
  isActive: boolean;
}
const emptyForm = (): ProductForm => ({
  id: null,
  imageUrl: '',
  sku: '',
  name: '',
  groupId: '',
  supplierId: '',
  barcode: '',
  unit: 'ш',
  priceMnt: '',
  isVatable: true,
  isActive: true,
});

/** Зургийг ~600px болгож жижгэрүүлж, JPEG (q0.72) data URL болгоно (DB-д inline хадгална). */
function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => reject(new Error('image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

export default function MaterialsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [groups, setGroups] = useState<ProductGroupDto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [form, setForm] = useState<ProductForm | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false); // зураг авах (камер)
  const [scanOpen, setScanOpen] = useState(false); // баркод scan (камер)
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, g, s] = await Promise.all([
      inventoryApi.products(),
      inventoryApi.groups(),
      inventoryApi.suppliers(),
    ]);
    setProducts(p);
    setGroups(g);
    setSuppliers(s);
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }
    load()
      .then(() => setReady(true))
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Өгөгдөл ачаалахад алдаа гарлаа');
        setReady(true);
      });
  }, [router, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (groupFilter !== 'ALL' && (p.groupId ?? '') !== groupFilter) return false;
      if (activeFilter === 'active' && !p.isActive) return false;
      if (activeFilter === 'inactive' && p.isActive) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.barcode ?? '').toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [products, search, groupFilter, activeFilter]);

  async function saveProduct() {
    if (!form) return;
    if (!form.sku.trim() || !form.name.trim() || !form.priceMnt) {
      setError('Код, нэр, нэгж үнэ заавал');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const base = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        unit: form.unit || 'ш',
        priceMnt: form.priceMnt.replace(/[^\d]/g, ''),
        isVatable: form.isVatable,
        isActive: form.isActive,
      };
      if (form.id) {
        await inventoryApi.updateProduct(form.id, {
          ...base,
          groupId: form.groupId || null,
          supplierId: form.supplierId || null,
          barcode: form.barcode.trim() || null,
          imageUrl: form.imageUrl || null,
        });
        setMsg('Бараа шинэчлэгдлээ');
      } else {
        await inventoryApi.createProduct({
          ...base,
          groupId: form.groupId || undefined,
          supplierId: form.supplierId || undefined,
          barcode: form.barcode.trim() || undefined,
          imageUrl: form.imageUrl || undefined,
        });
        setMsg('Бараа нэмэгдлээ');
      }
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Хадгалахад алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: ProductDto) {
    try {
      await inventoryApi.updateProduct(p.id, { isActive: !p.isActive });
      await load();
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Алдаа гарлаа');
    }
  }

  async function removeProduct(p: ProductDto) {
    if (!window.confirm(`"${p.name}"-г устгах уу?`)) return;
    try {
      await inventoryApi.deleteProduct(p.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Устгахад алдаа гарлаа');
    }
  }

  async function addGroup() {
    if (!newGroup.trim()) return;
    try {
      await inventoryApi.createGroup({ name: newGroup.trim(), sortOrder: groups.length + 1 });
      setNewGroup('');
      await load();
    } catch (e) {
      setError(e instanceof ApiException ? e.error.message : 'Бүлэг нэмэхэд алдаа');
    }
  }
  async function saveGroupName(g: ProductGroupDto, name: string) {
    if (name.trim() && name.trim() !== g.name) {
      await inventoryApi.updateGroup(g.id, { name: name.trim() }).catch(() => undefined);
      await load();
    }
  }
  async function toggleGroup(g: ProductGroupDto) {
    await inventoryApi.updateGroup(g.id, { isActive: !g.isActive }).catch(() => undefined);
    await load();
  }
  async function removeGroup(g: ProductGroupDto) {
    if (!window.confirm(`"${g.name}" бүлгийг устгах уу? (бараа устахгүй, зөвхөн салгана)`)) return;
    await inventoryApi.deleteGroup(g.id).catch(() => undefined);
    await load();
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader icon={Package} title="Бараа материал" subtitle={`${products.length} бараа · ${groups.length} бүлэг`}>
        <button
          onClick={() => setGroupsOpen(true)}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Tags size={16} /> Бүлэг
        </button>
        <button
          onClick={() => setForm(emptyForm())}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
        >
          <Plus size={16} /> Шинэ бараа
        </button>
      </PageHeader>

      {error && <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="mb-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {/* Хэрэгслүүд */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:min-w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Нэр, код, баркодоор хайх…"
            className="min-h-touch w-full rounded-xl border bg-card pl-9 pr-3 text-sm shadow-sm"
          />
        </div>
        <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
          {(['all', 'active', 'inactive'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setActiveFilter(a)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${activeFilter === a ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {a === 'all' ? 'Бүгд' : a === 'active' ? 'Идэвхтэй' : 'Идэвхгүй'}
            </button>
          ))}
        </div>
      </div>

      {/* Бүлгийн chip */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setGroupFilter('ALL')}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${groupFilter === 'ALL' ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-accent'}`}
        >
          Бүх бүлэг
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroupFilter(g.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${groupFilter === g.id ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-accent'}`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Барааны жагсаалт */}
      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
          <Package size={28} className="mb-2 opacity-40" />
          Бараа алга байна
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`group flex gap-3 rounded-2xl border bg-card p-3 shadow-sm transition hover:shadow-md ${!p.isActive ? 'opacity-60' : ''}`}
            >
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
                <ProductImage src={p.imageUrl} alt={p.name} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{p.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-base font-bold text-blue-600">
                    {formatMnt(p.priceMnt)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {p.group && <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{p.group.name}</span>}
                  {p.supplier && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Truck size={11} /> {p.supplier.name}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(p)}
                    title={p.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${p.isActive ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
                  >
                    {p.isActive ? <Check size={12} /> : <X size={12} />}
                    {p.isActive ? 'Идэвхтэй' : 'Идэвхгүй'}
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() =>
                        setForm({
                          id: p.id,
                          imageUrl: p.imageUrl ?? '',
                          sku: p.sku,
                          name: p.name,
                          groupId: p.groupId ?? '',
                          supplierId: p.supplierId ?? '',
                          barcode: p.barcode ?? '',
                          unit: p.unit,
                          priceMnt: String(p.priceMnt),
                          isVatable: p.isVatable,
                          isActive: p.isActive,
                        })
                      }
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Засах"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => removeProduct(p)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Устгах"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Бараа нэмэх/засах modal */}
      {form && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm animate-overlay sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl animate-pop sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? 'Бараа засах' : 'Шинэ бараа'}</h2>
              <button onClick={() => setForm(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" aria-label="Хаах">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Зураг — файлаас сонгох эсвэл камераар авах */}
              <div>
                <Label>Барааны зураг</Label>
                <div className="flex items-center gap-3">
                  <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
                    <ProductImage key={form.imageUrl} src={form.imageUrl || null} alt="" iconSize={24} />
                    {form.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, imageUrl: '' })}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white"
                        aria-label="Зураг устгах"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent"
                    >
                      <Upload size={16} /> Файлаас сонгох
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent"
                    >
                      <Camera size={16} /> Камераар авах
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        try {
                          const url = await fileToDataUrl(f);
                          setForm((prev) => (prev ? { ...prev, imageUrl: url } : prev));
                        } catch {
                          setError('Зураг боловсруулахад алдаа гарлаа');
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Барааны код">
                  <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
                </Field>
                <Field label="Нэгж">
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="ш / кг / л" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
                </Field>
              </div>

              <Field label="Барааны нэр">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Барааны бүлэг">
                  <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-2 text-sm">
                    <option value="">— сонгох —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Нийлүүлэгч">
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="min-h-touch w-full rounded-xl border bg-background px-2 text-sm">
                    <option value="">— сонгох —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Баркод">
                <div className="flex gap-2">
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="гараар эсвэл камераар scan"
                    className="min-h-touch flex-1 rounded-xl border bg-background px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setScanOpen(true)}
                    className="inline-flex min-h-touch items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent"
                  >
                    <ScanLine size={16} /> Scan
                  </button>
                </div>
              </Field>

              <Field label="Нэгж үнэ (₮)">
                <input value={form.priceMnt} onChange={(e) => setForm({ ...form, priceMnt: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className="min-h-touch w-full rounded-xl border bg-background px-3 text-sm" />
              </Field>

              <div className="flex items-center gap-4 pt-1">
                <Toggle checked={form.isVatable} onChange={(v) => setForm({ ...form, isVatable: v })} label="НӨАТ-тай" />
                <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Идэвхтэй" />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={() => setForm(null)} className="min-h-touch flex-1 rounded-xl border bg-card font-medium hover:bg-accent">
                Болих
              </button>
              <button onClick={saveProduct} disabled={busy} className="min-h-touch flex-1 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm hover:brightness-105 disabled:opacity-50">
                {busy ? 'Хадгалж байна…' : 'Хадгалах'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Бүлэг удирдах modal */}
      {groupsOpen && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm animate-overlay sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl animate-pop sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Барааны бүлэг</h2>
              <button onClick={() => setGroupsOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" aria-label="Хаах">
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 flex gap-2">
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGroup()}
                placeholder="Шинэ бүлгийн нэр"
                className="min-h-touch flex-1 rounded-xl border bg-background px-3 text-sm"
              />
              <button onClick={addGroup} className="inline-flex min-h-touch items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground">
                <Plus size={16} /> Нэмэх
              </button>
            </div>
            <ul className="space-y-2">
              {groups.length === 0 ? (
                <li className="py-4 text-center text-sm text-muted-foreground">Бүлэг алга</li>
              ) : (
                groups.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 rounded-xl border bg-background p-2">
                    <input
                      defaultValue={g.name}
                      onBlur={(e) => saveGroupName(g, e.target.value)}
                      className="min-h-touch flex-1 rounded-lg border-transparent bg-transparent px-2 text-sm focus:border-border focus:bg-card"
                    />
                    <button
                      onClick={() => toggleGroup(g)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-medium ${g.isActive ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
                    >
                      {g.isActive ? 'Идэвхтэй' : 'Идэвхгүй'}
                    </button>
                    <button onClick={() => removeGroup(g)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Устгах">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        </Portal>
      )}

      {/* Камераар зураг авах */}
      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onCapture={(url) => {
            setForm((p) => (p ? { ...p, imageUrl: url } : p));
            setCameraOpen(false);
          }}
        />
      )}

      {/* Баркод камераар уншуулах */}
      {scanOpen && (
        <ScannerModal
          onClose={() => setScanOpen(false)}
          onResult={(code) => {
            setForm((p) => (p ? { ...p, barcode: code } : p));
            setScanOpen(false);
          }}
        />
      )}
    </main>
  );
}

/** Камер амьд урсгалаас зураг авах (canvas → JPEG data URL, ~600px). */
function CameraModal({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setErr('Камер нээгдсэнгүй. Утсан дээр HTTPS шаардлагатай (эсвэл "Файлаас сонгох").');
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const max = 600;
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    onCapture(c.toDataURL('image/jpeg', 0.72));
  }
  return (
    <ModalShell title="Зураг авах" onClose={onClose}>
      {err ? (
        <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{err}</p>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="aspect-video w-full rounded-2xl bg-black object-cover" />
          <button onClick={snap} className="mt-3 inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm hover:brightness-105">
            <Camera size={18} /> Зураг авах
          </button>
        </>
      )}
    </ModalShell>
  );
}

/** ZXing камер баркод уншуулагч (бүх формат). */
function ScannerModal({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | null = null;
    let active = true;
    if (!videoRef.current) return;
    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, _e, ctrls) => {
        controls = ctrls;
        if (result && active) {
          active = false;
          ctrls.stop();
          onResult(result.getText());
        }
      })
      .then((c) => {
        controls = c;
      })
      .catch(() => setErr('Камер/уншуулагч нээгдсэнгүй. Утсан дээр HTTPS шаардлагатай.'));
    return () => {
      active = false;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ModalShell title="Баркод уншуулах" onClose={onClose}>
      {err ? (
        <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{err}</p>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="aspect-video w-full rounded-2xl bg-black object-cover" />
          <p className="mt-2 text-center text-xs text-muted-foreground">Баркодыг камерт чиглүүлнэ үү…</p>
        </>
      )}
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm animate-overlay sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-3xl border bg-card p-4 shadow-2xl animate-pop sm:rounded-3xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" aria-label="Хаах">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

/** Барааны зураг — ачаалагдахгүй (эвдэрсэн URL) бол placeholder лого харуулна. */
function ProductImage({ src, alt, iconSize = 22 }: { src: string | null; alt: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <ImageIcon size={iconSize} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
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
