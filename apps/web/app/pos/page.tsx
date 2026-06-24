'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  CreditCard,
  Fuel,
  Layers,
  Minus,
  Package,
  Plus,
  Receipt,
  Search,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { formatMnt, lineTotalMnt, milliToDecimalString, toMilliUnits } from '@fuel/schemas';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@fuel/types';
import { apiFetch, ApiException, tokenStore } from '@/lib/api';
import {
  type CatalogDto,
  posApi,
  type ProductCatalogItem,
  type ShiftDto,
  type StationDto,
  type SaleDto,
} from '@/lib/pos-api';
import { useRealtime } from '@/lib/realtime';
import { clearDead, deadCount, enqueueSale, queueCount } from '@/lib/offline-queue';
import { flushQueue } from '@/lib/sync';
import { type Customer, customersApi } from '@/lib/customers-api';

interface CartLine {
  key: string;
  kind: 'FUEL' | 'PRODUCT';
  refId: string;
  label: string;
  unitPriceMnt: string;
  // mode==='amount' (зөвхөн түлш) үед qty нь ₮ дүн; эс бөгөөс литр/ширхэг.
  qty: string;
  mode: 'qty' | 'amount';
}

function safeLineTotal(line: CartLine): bigint {
  try {
    if (!line.qty) return 0n;
    // Мөнгөн дүнгээр түлш авах — дүн нь шууд нийт (литр сервер дээр бодогдоно)
    if (line.mode === 'amount') return BigInt(line.qty.replace(/\D/g, '') || '0');
    return lineTotalMnt(BigInt(line.unitPriceMnt), toMilliUnits(line.qty));
  } catch {
    return 0n;
  }
}

/**
 * Тоо хэмжээг 1-ээр нэмэх — float биш, BigInt milli-ээр (3-оронтой regex-д унахаас сэргийлнэ).
 * Бутархай бараа (ж: масло литрээр) '0.118' → '1.118' зөв; float бол '1.1179999…' болж эвдэрнэ.
 */
function incQty(qty: string): string {
  try {
    const next = milliToDecimalString(toMilliUnits(qty || '0') + 1000n);
    return next.replace(/0+$/, '').replace(/\.$/, ''); // '2.000'→'2', '2.500'→'2.5'
  } catch {
    return '1';
  }
}
/** Тоо хэмжээг 1-ээр хасах (BigInt milli); 0 болбол '0' буцаана (мөр устгана). */
function decQty(qty: string): string {
  try {
    const next = toMilliUnits(qty || '0') - 1000n;
    if (next <= 0n) return '0';
    return milliToDecimalString(next).replace(/0+$/, '').replace(/\.$/, '');
  } catch {
    return '0';
  }
}

/** Мөнгөн дүнгээр авах үед ойролцоо литрийг харуулах (≈ дүн / үнэ). */
function derivedLiters(line: CartLine): string {
  try {
    const price = BigInt(line.unitPriceMnt);
    const amount = BigInt(line.qty.replace(/\D/g, '') || '0');
    if (price <= 0n || amount <= 0n) return '';
    const milli = (amount * 1000n) / price; // литр × 1000 (доош)
    // Float ашиглахгүй (§2.1) — milli→decimal string, 2 орон хүртэл таслана.
    const [whole, frac = ''] = milliToDecimalString(milli).split('.');
    return `${whole}.${frac.slice(0, 2).padEnd(2, '0')}`;
  } catch {
    return '';
  }
}

/** Нэг төлбөрийн мөр (split payment). amount/tendered нь зөвхөн цифр (₮ integer). */
interface PayRow {
  id: string;
  method: PaymentMethod;
  amount: string; // тухайн хэлбэрээр төлөх дүн (нийт дүнд ороно)
  tendered: string; // ЗӨВХӨН бэлэн: авсан бэлэн (хариулт бодоход, серверт илгээхгүй)
  maskedPan: string; // карт: ****1234
  reference: string; // карт: зөвшөөрлийн код
}
function newPayRow(method: PaymentMethod = 'CASH', amount = ''): PayRow {
  return { id: crypto.randomUUID(), method, amount, tendered: '', maskedPan: '', reference: '' };
}
function payAmt(r: PayRow): bigint {
  try {
    return BigInt(r.amount.replace(/[^\d]/g, '') || '0');
  } catch {
    return 0n;
  }
}
function toBig(s: string): bigint {
  try {
    return BigInt(s.replace(/[^\d]/g, '') || '0');
  } catch {
    return 0n;
  }
}

type PayTab = 'CASH' | 'CARD' | 'CREDIT' | 'SPLIT';
const PAY_TABS: { key: PayTab; label: string; icon: typeof Banknote; fkey: string }[] = [
  { key: 'CASH', label: 'Бэлэн мөнгө', icon: Banknote, fkey: 'F1' },
  { key: 'CARD', label: 'Карт', icon: CreditCard, fkey: 'F2' },
  { key: 'CREDIT', label: 'Зээл', icon: Wallet, fkey: 'F3' },
  { key: 'SPLIT', label: 'Хосолсон', icon: Layers, fkey: 'F4' },
];
// Ангиллын chip-ийн өнгөний цэг (зөвхөн харагдац)
const CHIP_DOT = ['bg-violet-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500', 'bg-emerald-500'];

export default function PosPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [stationId, setStationId] = useState<string>('');
  const [shift, setShift] = useState<ShiftDto | null>(null);
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PayRow[]>(() => [newPayRow('CASH')]);
  const [payTab, setPayTab] = useState<PayTab>('CASH');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<SaleDto | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [dead, setDead] = useState(0);
  const [liveSales, setLiveSales] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [catalogTab, setCatalogTab] = useState<'FUEL' | 'MATERIAL'>('FUEL');
  const [me, setMe] = useState<{ name: string | null } | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  // Давхар submit-ээс (async busy state-ийн цонх) синхрон хамгаалах lock
  const submittingRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    setQueued(await queueCount());
    setDead(await deadCount());
  }, []);

  // Realtime — бусад төхөөрөмжийн борлуулалт шууд тоологдоно (§4)
  const { connected } = useRealtime({ 'sale.created': () => setLiveSales((c) => c + 1) });

  // Online/offline + дарааллыг автоматаар sync (§9)
  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshCounts();
    const onOnline = async () => {
      setOnline(true);
      const r = await flushQueue();
      await refreshCounts();
      if (r.synced > 0) setMsg(`${r.synced} офлайн борлуулалт sync хийгдлээ`);
      if (r.dead > 0) setError(`${r.dead} борлуулалт sync хийж чадсангүй — гар аргаар шийдвэрлэнэ үү`);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshCounts]);

  // Анхны ачаалал — token шалгах, салбар авах
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
        void customersApi.list().then(setCustomers).catch(() => undefined);
        void apiFetch<{ name: string | null }>('/auth/me').then(setMe).catch(() => undefined);
        setReady(true);
      })
      .catch((e) => {
        if (e instanceof ApiException && e.error.statusCode === 401) router.replace('/login');
        else setError('Салбар ачаалахад алдаа гарлаа');
        setReady(true);
      });
  }, [router]);

  const loadStation = useCallback(async (sid: string) => {
    setError(null);
    try {
      const [sh, cat] = await Promise.all([posApi.currentShift(sid), posApi.catalog(sid)]);
      setShift(sh);
      setCatalog(cat);
      setCart([]);
    } catch {
      setError('Өгөгдөл ачаалахад алдаа гарлаа');
    }
  }, []);

  useEffect(() => {
    if (stationId) void loadStation(stationId);
  }, [stationId, loadStation]);

  const total = useMemo(() => cart.reduce((sum, l) => sum + safeLineTotal(l), 0n), [cart]);

  // Бараа материалыг ангиллаар бүлэглэх (масло, тосол г.м) — §каталог
  const productGroups = useMemo(() => {
    const map = new Map<string, ProductCatalogItem[]>();
    for (const p of catalog?.products ?? []) {
      const cat = p.category || 'Бусад';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'mn'));
  }, [catalog]);

  // Каталог хайлт/шүүлт
  const q = catalogQuery.trim().toLowerCase();
  const filteredFuels = (catalog?.fuels ?? []).filter(
    (f) => !q || f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q),
  );
  const categories = productGroups.map(([c]) => c);
  const visibleProductGroups = productGroups
    .filter(([c]) => activeCategory === 'ALL' || c === activeCategory)
    .map(
      ([c, items]) =>
        [
          c,
          items.filter(
            (p) => !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q),
          ),
        ] as [string, ProductCatalogItem[]],
    )
    .filter(([, items]) => items.length > 0);

  // Зээлийн харилцагчийн хайлт — идэвхтэй + нэр/утсаар шүүх
  const filteredCustomers = useMemo(() => {
    const s = customerSearch.trim().toLowerCase();
    return customers
      .filter((c) => c.isActive)
      .filter(
        (c) => !s || c.name.toLowerCase().includes(s) || (c.phone ?? '').toLowerCase().includes(s),
      )
      .slice(0, 20);
  }, [customers, customerSearch]);
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  // ── Split payment тооцоо (бүгд BigInt — §2.1 float биш) ──
  const paidSum = useMemo(() => payments.reduce((s, r) => s + payAmt(r), 0n), [payments]);
  const remaining = total - paidSum; // >0 дутуу, <0 илүү, 0 тэнцсэн
  const anyCredit = useMemo(
    () => payments.some((r) => r.method === 'CREDIT' && payAmt(r) > 0n),
    [payments],
  );

  // Ганц хэлбэрийн горим (CASH/CARD/CREDIT) — нэг мөр = нийт дүн (auto-sync).
  useEffect(() => {
    if (payTab === 'SPLIT') return;
    setPayments((ps) => {
      const first = ps[0] ?? newPayRow(payTab);
      return [{ ...first, method: payTab, amount: total > 0n ? total.toString() : '' }];
    });
  }, [total, payTab]);

  function setPayRow(id: string, patch: Partial<PayRow>) {
    setPayments((ps) => ps.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addPayRow() {
    setPayments((ps) => (ps.length >= 5 ? ps : [...ps, newPayRow('CARD')]));
  }
  function removePayRow(id: string) {
    setPayments((ps) => (ps.length <= 1 ? ps : ps.filter((r) => r.id !== id)));
  }
  /** Энэ мөрөнд үлдэгдэл дүнг бөглөж нийлбэрийг нийт дүнтэй тэнцүүлнэ. */
  function fillRemaining(id: string) {
    const cur = payAmt(payments.find((r) => r.id === id) ?? newPayRow());
    const target = cur + (total - paidSum);
    setPayRow(id, { amount: (target > 0n ? target : 0n).toString() });
  }

  function addFuel(fuelGradeId: string, label: string, price: string) {
    setCart((c) => [
      ...c,
      { key: crypto.randomUUID(), kind: 'FUEL', refId: fuelGradeId, label, unitPriceMnt: price, qty: '', mode: 'qty' },
    ]);
  }
  function addProduct(productId: string, label: string, price: string) {
    setCart((c) => {
      // Ижил бараа сагсанд байвал шинэ мөр нэмэхгүй, тоог нь +1 (стандарт POS зан төлөв)
      const existing = c.find((l) => l.kind === 'PRODUCT' && l.refId === productId);
      if (existing) {
        return c.map((l) => (l.key === existing.key ? { ...l, qty: incQty(l.qty) } : l));
      }
      return [
        ...c,
        { key: crypto.randomUUID(), kind: 'PRODUCT', refId: productId, label, unitPriceMnt: price, qty: '1', mode: 'qty' },
      ];
    });
  }
  function setQty(key: string, qty: string) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty } : l)));
  }
  /** Барааны тоог +1/−1 (stepper). 0 болбол мөрийг устгана. */
  function stepQty(key: string, dir: 1 | -1) {
    setCart((c) => {
      const line = c.find((l) => l.key === key);
      if (!line) return c;
      if (dir === 1) return c.map((l) => (l.key === key ? { ...l, qty: incQty(l.qty) } : l));
      const next = decQty(line.qty);
      if (next === '0') return c.filter((l) => l.key !== key);
      return c.map((l) => (l.key === key ? { ...l, qty: next } : l));
    });
  }
  /** Түлшний мөрийг литр ⇄ мөнгөн дүн горимд сэлгэх (qty-г цэвэрлэнэ). */
  function toggleMode(key: string) {
    setCart((c) =>
      c.map((l) => (l.key === key ? { ...l, mode: l.mode === 'qty' ? 'amount' : 'qty', qty: '' } : l)),
    );
  }
  function removeLine(key: string) {
    setCart((c) => c.filter((l) => l.key !== key));
  }

  async function submitSale() {
    if (!shift || cart.length === 0 || total <= 0n) return;
    // Төлбөрийн нийлбэр нийт дүнтэй ЯГ тэнцэх ёстой (офлайн ч мөн — sync-д унахаас сэргийлнэ)
    if (paidSum !== total) {
      setError(
        remaining > 0n
          ? `Төлбөр дутуу: ${formatMnt(remaining)}`
          : `Төлбөр илүү: ${formatMnt(-remaining)} (бэлэн хариулт тооцогдоно, дүнг тэнцүүлнэ үү)`,
      );
      return;
    }
    if (anyCredit && !customerId) {
      setError('Зээлийн төлбөрт харилцагч сонгоно уу');
      return;
    }
    // Синхрон давхар-submit хамгаалалт (busy state async тул хангалтгүй)
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    setMsg(null);

    const clientGeneratedId = crypto.randomUUID();
    const body = {
      stationId,
      shiftId: shift.id,
      clientGeneratedId,
      lines: cart.map((l) => {
        if (l.kind === 'PRODUCT') return { type: 'PRODUCT', productId: l.refId, quantity: l.qty };
        // Түлш: мөнгөн дүнгээр эсвэл литрээр
        return l.mode === 'amount'
          ? { type: 'FUEL', fuelGradeId: l.refId, amountMnt: l.qty.replace(/\D/g, '') }
          : { type: 'FUEL', fuelGradeId: l.refId, quantity: l.qty };
      }),
      // Split payment: дүнтэй мөрүүдийг л илгээнэ (tendered нь зөвхөн UI-д хариулт бодоход)
      payments: payments
        .filter((r) => payAmt(r) > 0n)
        .map((r) => {
          // maskedPan/reference зөвхөн карт төлбөрт (сервер refine-тэй нийцүүлнэ)
          const isCard = r.method === 'CARD' || r.method === 'FUEL_CARD';
          return {
            method: r.method,
            amount: payAmt(r).toString(),
            ...(isCard && r.maskedPan ? { maskedPan: r.maskedPan } : {}),
            ...(isCard && r.reference ? { reference: r.reference } : {}),
          };
        }),
      // Харилцагч сонгосон бол борлуулалтад хавсаргана (зээлд заавал)
      customerId: customerId || undefined,
    };

    // Дараалалд хадгалахдаа ИЖИЛ clientGeneratedId ашиглана (давхар борлуулалтаас сэргийлнэ)
    const reset = () => {
      setCart([]);
      setPayments([newPayRow('CASH')]);
      setPayTab('CASH');
    };
    const queueOffline = async (note: string) => {
      await enqueueSale({ clientGeneratedId, stationId, createdAt: new Date().toISOString(), payload: body });
      reset();
      await refreshCounts();
      setMsg(note);
    };

    try {
      // Офлайн бол шууд дараалалд (§9 — POS зогсохгүй)
      if (!navigator.onLine) {
        await queueOffline('Офлайн: борлуулалт дараалалд хадгалагдлаа');
        return;
      }
      try {
        const sale = await posApi.createSale(body);
        setLastSale(sale);
        reset();
      } catch (e) {
        // 4xx бизнес алдаа → операторт харуулна. Сүлжээ/5xx/408/429 → дараалалд (§9).
        const retryable =
          !(e instanceof ApiException) ||
          e.error.statusCode >= 500 ||
          e.error.statusCode === 408 ||
          e.error.statusCode === 429;
        if (retryable) {
          await queueOffline('Сүлжээ тогтворгүй: дараалалд хадгаллаа');
        } else {
          setError((e as ApiException).error.message);
        }
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  // Гарын товчлол: F1–F4 төлбөрийн хэлбэр, F9 батлах (загварын дагуу)
  const submitRef = useRef(submitSale);
  submitRef.current = submitSale;
  useEffect(() => {
    if (!shift) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, PayTab> = { F1: 'CASH', F2: 'CARD', F3: 'CREDIT', F4: 'SPLIT' };
      if (e.key in map) {
        e.preventDefault();
        setPayTab(map[e.key]!);
      } else if (e.key === 'F9') {
        e.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shift]);

  if (!ready) {
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Ачаалж байна…</main>;
  }

  const canSubmit = !busy && cart.length > 0 && total > 0n && paidSum === total && !(anyCredit && !customerId);
  const single = payments[0];
  const singleChange =
    payTab === 'CASH' && single && toBig(single.tendered) > total ? toBig(single.tendered) - total : 0n;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-5 lg:px-6">
      {/* Толгой */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <Fuel size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Шатахуун POS</h1>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {stations.find((s) => s.id === stationId)?.name ?? 'Салбар'}
              </span>
              {me?.name ? ` · Кассир: ${me.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${online ? 'bg-emerald-500/15 text-emerald-700' : 'bg-destructive/15 text-destructive'}`}
          >
            ● {online ? 'Онлайн' : 'Офлайн'}
          </span>
          {queued > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700">
              Дараалал: {queued}
            </span>
          )}
          {dead > 0 && (
            <button
              onClick={async () => {
                await clearDead();
                await refreshCounts();
              }}
              title="Sync хийж чадаагүй борлуулалтыг устгах"
              className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive"
            >
              Алдаатай: {dead} ✕
            </button>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${connected ? 'bg-sky-500/15 text-sky-700' : 'bg-muted text-muted-foreground'}`}
          >
            {connected ? `⚡ ${liveSales}` : 'Realtime ○'}
          </span>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="min-h-touch rounded-lg border bg-card px-3 text-sm shadow-sm"
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {msg && <p className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {shift?.status !== 'OPEN' ? (
        <section className="mx-auto max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Receipt size={22} />
          </div>
          <h2 className="mb-1 font-semibold">
            {!shift
              ? 'Идэвхтэй ээлж алга'
              : shift.status === 'PENDING_OPEN'
                ? 'Ээлжийн нээлт хүлээгдэж байна'
                : shift.status === 'PENDING_CLOSE'
                  ? 'Ээлжийн хаалт хүлээгдэж байна'
                  : 'Ээлж идэвхгүй'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Борлуулалт хийхийн тулд «Ажилтан / Ээлж» цэснээс ээлж эхлүүлэх хүсэлт илгээж, нягтлан/админ
            батлуулна уу.
          </p>
          <Link
            href="/staff"
            className="inline-flex min-h-touch items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-sm transition hover:brightness-105"
          >
            Ажилтан / Ээлж рүү очих
          </Link>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(380px,420px)]">
          {/* ── Каталог ── */}
          <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
            {/* Таб */}
            <div className="mb-3 inline-flex rounded-xl bg-muted p-1">
              <button
                onClick={() => setCatalogTab('FUEL')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${catalogTab === 'FUEL' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Fuel size={16} /> Түлш
              </button>
              <button
                onClick={() => setCatalogTab('MATERIAL')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${catalogTab === 'MATERIAL' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Package size={16} /> Бараа материал
              </button>
            </div>

            {/* Хайлт */}
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Нэр эсвэл код хайх…"
                className="min-h-touch w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
              />
            </div>

            {/* Ангиллын chip (зөвхөн бараа материал) */}
            {catalogTab === 'MATERIAL' && categories.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory('ALL')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeCategory === 'ALL' ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-accent'}`}
                >
                  Бүгд
                </button>
                {categories.map((c, i) => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${activeCategory === c ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-accent'}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${CHIP_DOT[i % CHIP_DOT.length]}`} />
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Картууд */}
            {catalogTab === 'FUEL' ? (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-blue-500" />
                  <h2 className="text-sm font-semibold">Түлш</h2>
                  <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                    {filteredFuels.length}
                  </span>
                </div>
                {filteredFuels.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Илэрц алга</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredFuels.map((f) => (
                      <ProductTile
                        key={f.fuelGradeId}
                        code={f.code.replace('_', '-')}
                        name={f.name}
                        price={formatMnt(f.pricePerLiterMnt)}
                        unit="/л"
                        onClick={() => addFuel(f.fuelGradeId, f.name, f.pricePerLiterMnt)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : visibleProductGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {productGroups.length === 0 ? 'Бараа материал бүртгэгдээгүй байна' : 'Илэрц алга'}
              </p>
            ) : (
              <div className="space-y-5">
                {visibleProductGroups.map(([category, items], gi) => (
                  <div key={category}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`h-4 w-1 rounded-full ${CHIP_DOT[gi % CHIP_DOT.length]}`} />
                      <h2 className="text-sm font-semibold">{category}</h2>
                      <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {items.map((p) => (
                        <ProductTile
                          key={p.id}
                          code={p.sku}
                          name={p.name}
                          price={formatMnt(p.priceMnt)}
                          unit={p.unit}
                          onClick={() => addProduct(p.id, p.name, p.priceMnt)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Захиалга / төлбөр ── */}
          <aside className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
            {/* Харилцагч */}
            <div>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{selectedCustomer.name}</span>
                    {Number(selectedCustomer.creditLimitMnt) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        зээл үлд: {formatMnt(BigInt(selectedCustomer.creditLimitMnt) - BigInt(selectedCustomer.balanceMnt))}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setCustomerId('');
                      setCustomerSearch('');
                    }}
                    className="text-xs text-destructive"
                  >
                    Солих ✕
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Харилцагчийн нэр/утсаар хайх…"
                      className="min-h-touch w-full rounded-xl border bg-background pl-9 pr-11 text-sm"
                    />
                    <button
                      onClick={() => router.push('/customers')}
                      title="Шинэ харилцагч"
                      className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-primary text-primary-foreground"
                    >
                      <UserPlus size={16} />
                    </button>
                  </div>
                  {customerSearch.trim() && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-card shadow-lg">
                      {filteredCustomers.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">Харилцагч олдсонгүй</li>
                      ) : (
                        filteredCustomers.map((c) => (
                          <li key={c.id}>
                            <button
                              onClick={() => {
                                setCustomerId(c.id);
                                setCustomerSearch('');
                                setError(null);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                            >
                              <span>
                                {c.name}
                                {c.phone ? <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span> : null}
                              </span>
                              {Number(c.creditLimitMnt) > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  үлд: {formatMnt(BigInt(c.creditLimitMnt) - BigInt(c.balanceMnt))}
                                </span>
                              )}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Сагс */}
            {cart.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                <Receipt size={22} className="mb-1 opacity-40" />
                Сагс хоосон байна
              </div>
            ) : (
              <ul className="-mr-1 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
                {cart.map((l) => (
                  <li key={l.key} className="rounded-xl border bg-background p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.kind === 'PRODUCT'
                            ? `${formatMnt(l.unitPriceMnt)} × ${l.qty || '0'}`
                            : `${formatMnt(l.unitPriceMnt)}/л`}
                        </div>
                      </div>
                      <button
                        onClick={() => removeLine(l.key)}
                        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Хасах"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      {l.kind === 'PRODUCT' ? (
                        // Стандарт +/− stepper
                        <div className="inline-flex items-center rounded-lg border bg-card">
                          <button
                            onClick={() => stepQty(l.key, -1)}
                            className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground"
                            aria-label="Хасах"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="min-w-8 text-center text-sm font-medium tabular-nums">{l.qty || '0'}</span>
                          <button
                            onClick={() => stepQty(l.key, 1)}
                            className="grid h-8 w-8 place-items-center text-primary hover:opacity-80"
                            aria-label="Нэмэх"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      ) : (
                        // Түлш: литр ⇄ ₮ горим + оролт
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleMode(l.key)}
                            title="Литр ⇄ мөнгөн дүнгээр"
                            className="min-h-touch rounded-lg border bg-card px-2 text-xs font-medium"
                          >
                            {l.mode === 'amount' ? '₮' : 'л'}
                          </button>
                          <input
                            value={l.qty}
                            onChange={(e) =>
                              setQty(
                                l.key,
                                l.mode === 'amount'
                                  ? e.target.value.replace(/[^\d]/g, '')
                                  : e.target.value.replace(/[^\d.]/g, ''),
                              )
                            }
                            inputMode={l.mode === 'amount' ? 'numeric' : 'decimal'}
                            placeholder={l.mode === 'amount' ? '₮ дүн' : 'литр'}
                            className="min-h-touch w-24 rounded-lg border bg-card px-2 text-sm"
                          />
                        </div>
                      )}
                      <span className="font-semibold text-blue-600">{formatMnt(safeLineTotal(l))}</span>
                    </div>
                    {l.kind === 'FUEL' && l.mode === 'amount' && derivedLiters(l) && (
                      <div className="mt-1 text-right text-xs text-muted-foreground">≈ {derivedLiters(l)} л</div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Төлбөрийн хэлбэр */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Төлбөрийн хэлбэр
              </p>
              <div className="grid grid-cols-4 gap-2">
                {PAY_TABS.map((t) => {
                  const Icon = t.icon;
                  const active = payTab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setPayTab(t.key)}
                      className={`relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition ${active ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-accent'}`}
                    >
                      <span className="absolute right-1 top-1 text-[8px] text-muted-foreground/70">{t.fkey}</span>
                      <Icon size={18} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Сонгосон хэлбэрийн дэлгэрэнгүй */}
            {payTab === 'CASH' && single && (
              <div className="flex items-center gap-2">
                <input
                  value={single.tendered}
                  onChange={(e) => setPayRow(single.id, { tendered: e.target.value.replace(/[^\d]/g, '') })}
                  inputMode="numeric"
                  placeholder="Авсан бэлэн (хариулт бодох)"
                  className="min-h-touch flex-1 rounded-xl border bg-background px-3 text-sm"
                />
                {singleChange > 0n && (
                  <span className="whitespace-nowrap text-sm font-semibold text-emerald-600">
                    Хариулт: {formatMnt(singleChange)}
                  </span>
                )}
              </div>
            )}
            {payTab === 'CARD' && single && (
              <div className="flex gap-2">
                <input
                  value={single.maskedPan}
                  onChange={(e) => setPayRow(single.id, { maskedPan: e.target.value })}
                  placeholder="****1234"
                  className="min-h-touch w-28 rounded-xl border bg-background px-3 text-sm"
                />
                <input
                  value={single.reference}
                  onChange={(e) => setPayRow(single.id, { reference: e.target.value })}
                  placeholder="Зөвшөөрлийн код"
                  className="min-h-touch flex-1 rounded-xl border bg-background px-3 text-sm"
                />
              </div>
            )}
            {payTab === 'CREDIT' && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                {customerId
                  ? 'Зээл харилцагчийн авлагад бичигдэнэ.'
                  : 'Зээлээр зарахын тулд дээрээс харилцагч сонгоно уу.'}
              </p>
            )}

            {/* Хосолсон (split) засварлагч */}
            {payTab === 'SPLIT' && (
              <div className="space-y-2 rounded-xl border bg-background/50 p-2">
                {payments.map((r) => (
                  <div key={r.id} className="rounded-lg border bg-card p-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={r.method}
                        onChange={(e) => {
                          const m = e.target.value as PaymentMethod;
                          setPayRow(
                            r.id,
                            m === 'CARD' || m === 'FUEL_CARD' ? { method: m } : { method: m, maskedPan: '', reference: '' },
                          );
                        }}
                        className="min-h-touch flex-1 rounded-lg border bg-background px-2 text-sm"
                      >
                        {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABEL[m]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={r.amount}
                        onChange={(e) => setPayRow(r.id, { amount: e.target.value.replace(/[^\d]/g, '') })}
                        inputMode="numeric"
                        placeholder="₮ дүн"
                        className="min-h-touch w-24 rounded-lg border bg-background px-2 text-sm"
                      />
                      {payments.length > 1 && (
                        <button onClick={() => removePayRow(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Хасах">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <button onClick={() => fillRemaining(r.id)} className="text-xs text-primary">
                        Үлдэгдлийг бөглөх
                      </button>
                      <span className="text-xs text-muted-foreground">{formatMnt(payAmt(r))}</span>
                    </div>
                    {r.method === 'CASH' && (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={r.tendered}
                          onChange={(e) => setPayRow(r.id, { tendered: e.target.value.replace(/[^\d]/g, '') })}
                          inputMode="numeric"
                          placeholder="Авсан бэлэн (хариулт)"
                          className="min-h-touch flex-1 rounded-lg border bg-background px-2 text-xs"
                        />
                        {toBig(r.tendered) > payAmt(r) && (
                          <span className="whitespace-nowrap text-xs font-medium text-emerald-600">
                            Хариулт: {formatMnt(toBig(r.tendered) - payAmt(r))}
                          </span>
                        )}
                      </div>
                    )}
                    {(r.method === 'CARD' || r.method === 'FUEL_CARD') && (
                      <div className="mt-1 flex gap-2">
                        <input
                          value={r.maskedPan}
                          onChange={(e) => setPayRow(r.id, { maskedPan: e.target.value })}
                          placeholder="****1234"
                          className="min-h-touch w-24 rounded-lg border bg-background px-2 text-xs"
                        />
                        <input
                          value={r.reference}
                          onChange={(e) => setPayRow(r.id, { reference: e.target.value })}
                          placeholder="Зөвшөөрлийн код"
                          className="min-h-touch flex-1 rounded-lg border bg-background px-2 text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
                {payments.length < 5 && (
                  <button
                    onClick={addPayRow}
                    className="w-full rounded-lg border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    + Төлбөр нэмэх
                  </button>
                )}
                <div
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${remaining === 0n ? 'bg-emerald-500/10 text-emerald-700' : remaining > 0n ? 'bg-amber-500/10 text-amber-700' : 'bg-destructive/10 text-destructive'}`}
                >
                  <span>{remaining === 0n ? '✓ Тэнцсэн' : remaining > 0n ? 'Дутуу' : 'Илүү'}</span>
                  <span className="font-semibold">
                    {formatMnt(remaining === 0n ? paidSum : remaining > 0n ? remaining : -remaining)}
                  </span>
                </div>
              </div>
            )}

            {/* Нийт */}
            <div className="space-y-1 border-t pt-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Нийт дүн</span>
                <span>{formatMnt(total)}</span>
              </div>
              {singleChange > 0n && (
                <div className="flex items-center justify-between text-sm text-emerald-600">
                  <span>Хариулт</span>
                  <span>{formatMnt(singleChange)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-semibold">Төлөх дүн</span>
                <span className="text-xl font-bold text-blue-600">{formatMnt(total)}</span>
              </div>
            </div>

            {/* Батлах */}
            <button
              onClick={submitSale}
              disabled={!canSubmit}
              className="relative inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-sm transition enabled:hover:brightness-105 disabled:opacity-50"
            >
              <Receipt size={18} />
              {busy ? 'Боловсруулж байна…' : `Захиалга батлах — ${formatMnt(total)}`}
              <span className="absolute right-2 top-1.5 text-[9px] text-primary-foreground/70">F9</span>
            </button>

            {lastSale && (
              <div className="rounded-xl bg-emerald-500/10 p-3 text-sm">
                <div className="font-semibold text-emerald-700">✅ Борлуулалт амжилттай</div>
                <div className="mt-1 text-muted-foreground">
                  Нийт: {formatMnt(lastSale.totalMnt)} · НӨАТ: {formatMnt(lastSale.vatMnt)}
                </div>
                {lastSale.payments && lastSale.payments.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {lastSale.payments.map((p, i) => (
                      <span key={i} className="mr-2">
                        {PAYMENT_METHOD_LABEL[p.method]}: {formatMnt(p.amountMnt)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

/** Каталогийн нэг карт — код badge, нэр, цэнхэр үнэ, нэгж, нэмэх (+) */
function ProductTile({
  code,
  name,
  price,
  unit,
  onClick,
}: {
  code: string;
  name: string;
  price: string;
  unit: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-sky-400" />
      <div className="mb-1.5 flex items-start justify-between">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {code}
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
          <Plus size={14} />
        </span>
      </div>
      <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">{name}</div>
      <div className="mt-1 flex items-end justify-between">
        <span className="text-base font-bold text-blue-600">{price}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </div>
    </button>
  );
}
