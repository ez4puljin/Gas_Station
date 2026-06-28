import { describe, expect, it } from 'vitest';
import { computeAging } from './aging';

const asOf = new Date('2026-06-20T00:00:00Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);

describe('computeAging — FIFO насжилт', () => {
  it('нэг шинэ нэхэмжлэх → 0-30 бүлэгт', () => {
    const a = computeAging([{ date: daysAgo(10), amountMnt: 1000n }], asOf);
    expect(a.b0_30Mnt).toBe(1000n);
    expect(a.totalMnt).toBe(1000n);
  });

  it('хуучин нэхэмжлэх → зөв бүлэгт', () => {
    expect(computeAging([{ date: daysAgo(45), amountMnt: 500n }], asOf).b31_60Mnt).toBe(500n);
    expect(computeAging([{ date: daysAgo(75), amountMnt: 500n }], asOf).b61_90Mnt).toBe(500n);
    expect(computeAging([{ date: daysAgo(200), amountMnt: 500n }], asOf).b90plusMnt).toBe(500n);
  });

  it('FIFO: төлбөр хамгийн хуучин нэхэмжлэхийг эхэлж барагдуулна', () => {
    // 45 хоногийн өмнө 1000 нэхэмжлэх, 10 хоногийн өмнө 1000 нэхэмжлэх, дараа нь 1000 төлсөн
    const a = computeAging(
      [
        { date: daysAgo(45), amountMnt: 1000n },
        { date: daysAgo(10), amountMnt: 1000n },
        { date: daysAgo(1), amountMnt: -1000n },
      ],
      asOf,
    );
    // Хуучин (45 хон) бүрэн барагдаж, шинэ (10 хон) 1000 үлдэнэ → 0-30
    expect(a.b31_60Mnt).toBe(0n);
    expect(a.b0_30Mnt).toBe(1000n);
    expect(a.totalMnt).toBe(1000n);
  });

  it('хэсэгчилсэн төлбөр', () => {
    const a = computeAging(
      [
        { date: daysAgo(75), amountMnt: 1000n },
        { date: daysAgo(1), amountMnt: -300n },
      ],
      asOf,
    );
    expect(a.b61_90Mnt).toBe(700n);
    expect(a.totalMnt).toBe(700n);
  });

  it('бүрэн төлсөн → тэг', () => {
    const a = computeAging(
      [
        { date: daysAgo(20), amountMnt: 1000n },
        { date: daysAgo(1), amountMnt: -1000n },
      ],
      asOf,
    );
    expect(a.totalMnt).toBe(0n);
  });

  it('илүү төлбөр (урьдчилгаа) → 0, сөрөгт орохгүй', () => {
    const a = computeAging(
      [
        { date: daysAgo(20), amountMnt: 1000n },
        { date: daysAgo(1), amountMnt: -1500n },
      ],
      asOf,
    );
    expect(a.totalMnt).toBe(0n);
  });
});
