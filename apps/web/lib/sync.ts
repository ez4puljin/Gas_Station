import { ApiException, apiFetch } from './api';
import { enqueueSale, getQueuedSales, moveToDead, type QueuedSale, removeQueued } from './offline-queue';

const DEVICE_KEY = 'fuel.deviceId';
const MAX_ATTEMPTS = 8; // түр зуурын алдааны дээд оролдлого, дараа нь dead

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

interface PushResult {
  results: { clientGeneratedId: string; status: 'synced' | 'duplicate' | 'failed'; error?: string }[];
  synced: number;
  duplicate: number;
  failed: number;
}

export interface FlushSummary {
  synced: number;
  duplicate: number;
  retry: number; // дахин оролдоно (түр зуурын)
  dead: number; // гар аргаар шийдвэрлэх (terminal)
}

/** 4xx (408/429-ээс бусад) нь terminal — дахин оролдох нь утгагүй. */
function isTerminalStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

let flushing = false;

/**
 * IndexedDB дарааллыг төв рүү sync хийнэ (§9).
 *   • synced/duplicate → дарааллаас устгана.
 *   • terminal алдаа (per-item failed, эсвэл 403 г.м) → dead дараалалд (оператор шийднэ) — мөнхийн давталтгүй.
 *   • түр зуурын алдаа (сүлжээ/5xx) → дараалалд үлдээж дахин оролдоно (attempts cap-тай).
 * Зэрэгцээ дуудлагаас хамгаалах guard-тай.
 */
export async function flushQueue(): Promise<FlushSummary> {
  const empty: FlushSummary = { synced: 0, duplicate: 0, retry: 0, dead: 0 };
  if (flushing) return empty;
  flushing = true;
  try {
    const items = await getQueuedSales();
    if (items.length === 0) return empty;

    const byStation = new Map<string, QueuedSale[]>();
    for (const it of items) {
      const g = byStation.get(it.stationId);
      if (g) g.push(it);
      else byStation.set(it.stationId, [it]);
    }

    const summary: FlushSummary = { synced: 0, duplicate: 0, retry: 0, dead: 0 };
    const deviceId = getDeviceId();

    for (const [stationId, group] of byStation) {
      const byId = new Map(group.map((g) => [g.clientGeneratedId, g]));
      try {
        const res = await apiFetch<PushResult>('/sync/push', {
          method: 'POST',
          body: JSON.stringify({
            stationId,
            deviceId,
            items: group.map((g) => ({
              type: 'sale.create',
              clientGeneratedId: g.clientGeneratedId,
              clientCreatedAt: g.createdAt,
              payload: g.payload,
            })),
          }),
        });
        for (const r of res.results) {
          if (r.status === 'synced') {
            await removeQueued(r.clientGeneratedId);
            summary.synced++;
          } else if (r.status === 'duplicate') {
            await removeQueued(r.clientGeneratedId);
            summary.duplicate++;
          } else {
            // Серверийн domain татгалзал — terminal, мөнхийн давталтаас сэргийлж dead рүү
            const item = byId.get(r.clientGeneratedId);
            if (item) await moveToDead(item, r.error ?? 'Сервер татгалзлаа');
            summary.dead++;
          }
        }
      } catch (e) {
        if (e instanceof ApiException && isTerminalStatus(e.error.statusCode)) {
          // Бүх багц terminal (ж: 403 эрхгүй) → dead
          for (const g of group) {
            await moveToDead(g, e.error.message);
            summary.dead++;
          }
        } else {
          // Сүлжээ/5xx — түр зуурын. attempts cap хүртэл дахин оролдоно.
          for (const g of group) {
            const attempts = (g.attempts ?? 0) + 1;
            if (attempts >= MAX_ATTEMPTS) {
              await moveToDead(g, 'Хэт олон удаа sync амжилтгүй');
              summary.dead++;
            } else {
              await enqueueSale({ ...g, attempts });
              summary.retry++;
            }
          }
        }
      }
    }
    return summary;
  } finally {
    flushing = false;
  }
}

export { getDeviceId };
