import { describe, expect, it } from 'vitest';
import { lineTotalMnt, milliToDecimalString, toMilliUnits } from './quantity';

describe('toMilliUnits', () => {
  it('бүхэл литр', () => {
    expect(toMilliUnits('10')).toBe(10000n);
    expect(toMilliUnits(10)).toBe(10000n);
  });

  it('бутархай (3 хүртэл орон)', () => {
    expect(toMilliUnits('12.5')).toBe(12500n);
    expect(toMilliUnits('0.001')).toBe(1n);
    expect(toMilliUnits('12.345')).toBe(12345n);
  });

  it('3-аас илүү бутархайг татгалзана', () => {
    expect(() => toMilliUnits('1.2345')).toThrow();
  });

  it('буруу утгыг татгалзана', () => {
    expect(() => toMilliUnits('abc')).toThrow();
  });
});

describe('milliToDecimalString', () => {
  it('milli → Decimal string', () => {
    expect(milliToDecimalString(12500n)).toBe('12.500');
    expect(milliToDecimalString(1n)).toBe('0.001');
    expect(milliToDecimalString(-10000n)).toBe('-10.000');
  });
});

describe('lineTotalMnt', () => {
  it('үнэ × тоо хэмжээ (бүхэл)', () => {
    expect(lineTotalMnt(2690n, 10000n)).toBe(26900n); // 2690₮ × 10л
  });

  it('round half-up бутархай литр', () => {
    // 2690 × 1.234 = 3319.46 → 3319
    expect(lineTotalMnt(2690n, 1234n)).toBe(3319n);
  });

  it('round half-up дээш', () => {
    // 1000 × 1.5 = 1500 (яг); 1001 × 1.5 = 1501.5 → 1502
    expect(lineTotalMnt(1001n, 1500n)).toBe(1502n);
  });
});
