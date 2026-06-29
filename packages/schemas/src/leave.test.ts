import { describe, expect, it } from 'vitest';
import { countLeaveDays, rangesOverlap } from './leave';

describe('countLeaveDays', () => {
  it('нэг өдөр → 1', () => expect(countLeaveDays('2026-04-10', '2026-04-10')).toBe(1));
  it('5 өдрийн муж (хоёр захыг оруулж)', () => expect(countLeaveDays('2026-04-01', '2026-04-05')).toBe(5));
  it('сар дамнасан', () => expect(countLeaveDays('2026-04-28', '2026-05-02')).toBe(5));
  it('өндөр жилийн 2 сар', () => expect(countLeaveDays('2024-02-27', '2024-03-01')).toBe(4)); // 27,28,29,1
  it('end < start → алдаа', () => expect(() => countLeaveDays('2026-04-10', '2026-04-09')).toThrow());
});

describe('rangesOverlap', () => {
  it('огтлолцоно', () => expect(rangesOverlap('2026-04-01', '2026-04-10', '2026-04-08', '2026-04-15')).toBe(true));
  it('зэрэгцээ зах огтлолцоно', () => expect(rangesOverlap('2026-04-01', '2026-04-05', '2026-04-05', '2026-04-09')).toBe(true));
  it('огтлолцохгүй', () => expect(rangesOverlap('2026-04-01', '2026-04-05', '2026-04-06', '2026-04-09')).toBe(false));
});
