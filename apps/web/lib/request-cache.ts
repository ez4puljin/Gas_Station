/**
 * Хөнгөн хүсэлтийн кэш — тогтвортой, олон удаа давтагддаг GET (ж: `/stations` нь 16 хуудсанд)-ийг
 * хуудас солих бүрд дахин татахаас сэргийлнэ. In-flight dedup (зэрэг дуудсан ижил хүсэлт нэг promise
 * хуваалцана) + TTL. Нэвтрэх/гарахад бүхэлд нь, эсвэл мутацид prefix-ээр цэвэрлэнэ.
 *
 * Анхаар: энэ нь auth-scoped дата (хэрэглэгчийн хандах салбарууд) тул `tokenStore.set/clear`-д
 * заавал цэвэрлэнэ (өөр хэрэглэгч рүү шилжихэд хуучин дата үлдэхгүй).
 */
interface Entry {
  ts: number;
  promise: Promise<unknown>;
}

const store = new Map<string, Entry>();

/** key-ээр кэшлэсэн fetch. ttlMs дотор бол кэшээс, эс бөгөөс fetcher-ийг дуудна. */
export function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.promise as Promise<T>;

  const promise = fetcher();
  store.set(key, { ts: Date.now(), promise });
  // Алдаа гарвал кэшийг устгана (дараагийн дуудалт дахин оролдоно).
  void promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key);
  });
  return promise;
}

/** Кэш цэвэрлэх. prefix өгвөл түүгээр эхэлсэн key-уудыг, эс бөгөөс бүгдийг. */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
