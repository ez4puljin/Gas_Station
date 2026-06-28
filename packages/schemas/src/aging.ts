/**
 * Авлага/өглөгийн насжилт (aging) — FIFO. Цэвэр функц, тестлэгдэх.
 * Гүйлгээ: amountMnt тэмдэгтэй (+ = өр нэмэгдэх/нэхэмжлэх, − = төлбөр). Төлбөр нь ХАМГИЙН ХУУЧИН
 * нэхэмжлэхээс эхэлж барагдуулна (FIFO). Үлдсэн барагдаагүй нэхэмжлэхүүдийг наснаар нь хувааж бүлэглэнэ.
 * Мөнгө = integer MNT (bigint) — §2.1.
 */
export interface AgingTxn {
  date: Date | string;
  amountMnt: bigint; // тэмдэгтэй: + нэхэмжлэх, − төлбөр
}

export interface AgingBuckets {
  b0_30Mnt: bigint; // 0–30 хоног
  b31_60Mnt: bigint; // 31–60
  b61_90Mnt: bigint; // 61–90
  b90plusMnt: bigint; // 90+
  totalMnt: bigint;
}

const DAY = 86_400_000;

export function computeAging(txns: AgingTxn[], asOf: Date): AgingBuckets {
  const sorted = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Барагдаагүй нэхэмжлэхийн дараалал (FIFO): хамгийн хуучин нь эхэнд.
  const queue: { time: number; remaining: bigint }[] = [];
  for (const t of sorted) {
    if (t.amountMnt > 0n) {
      queue.push({ time: new Date(t.date).getTime(), remaining: t.amountMnt });
    } else if (t.amountMnt < 0n) {
      let pay = -t.amountMnt;
      while (pay > 0n && queue.length > 0) {
        const head = queue[0];
        if (!head) break;
        if (head.remaining <= pay) {
          pay -= head.remaining;
          queue.shift();
        } else {
          head.remaining -= pay;
          pay = 0n;
        }
      }
      // Илүү төлбөр (урьдчилгаа) — насжилтад тооцохгүй (сөрөг үлдэгдэл).
    }
  }
  const buckets: AgingBuckets = { b0_30Mnt: 0n, b31_60Mnt: 0n, b61_90Mnt: 0n, b90plusMnt: 0n, totalMnt: 0n };
  const asOfMs = asOf.getTime();
  for (const q of queue) {
    const ageDays = Math.floor((asOfMs - q.time) / DAY);
    if (ageDays <= 30) buckets.b0_30Mnt += q.remaining;
    else if (ageDays <= 60) buckets.b31_60Mnt += q.remaining;
    else if (ageDays <= 90) buckets.b61_90Mnt += q.remaining;
    else buckets.b90plusMnt += q.remaining;
    buckets.totalMnt += q.remaining;
  }
  return buckets;
}
